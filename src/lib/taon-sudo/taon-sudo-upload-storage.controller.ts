//#region imports
import type { R2Bucket } from '@cloudflare/workers-types';
import { Translation } from '@taon-dev/i18n/src';
import {
  TaonAuthContextRepository,
  TaonSessionProvider,
  TaonSessionRepository,
} from '@taon-dev/session/src';
import {
  ClassHelpers,
  ExpressRequest,
  getStatusCode,
  HttpStatusEnum,
  Models,
  Taon,
  TaonBaseStorageController,
  TaonController,
  TaonStorageObject,
} from 'taon/src';
import { path, UtilsJwt, UtilsOs } from 'tnp-core/src';
//#endregion

const t = Translation.for(Taon.__FILE_RELATIVE_PATH, Taon.LANG_IMPORT_MAP);

const STAGED_UPLOAD_KEY_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}__[a-zA-Z0-9._-]+$/i;

/**
 * Private staging area for sudo multipart uploads (bucket assets and raw
 * migration snapshots). Objects are consumed and removed by TaonSudoController
 * or TaonSudoRawMigrationController right after the upload completes.
 */
@TaonController<TaonSudoUploadStorageController>({
  className: 'TaonSudoUploadStorageController',
})
export class TaonSudoUploadStorageController extends TaonBaseStorageController<
  {},
  TaonSudoUploadStorageController
> {
  //#region fields & getters
  private readonly taonSessionRepository = this.injectCustomRepo(
    TaonSessionRepository,
  );

  private readonly taonAuthContextRepository = this.injectCustomRepo(
    TaonAuthContextRepository,
  );

  private readonly taonSessionProvider =
    this.injectProvider(TaonSessionProvider);
  //#endregion

  //#region methods / before each request
  protected async beforeEachRequest(
    data: Models.TaonCtrlBeforeEachRequestParams<TaonSudoUploadStorageController>,
  ): Promise<void> {
    //#region @backendFunc
    const { req } = data;
    if (this.taonSessionProvider.isLocalhost) {
      // QUICK_FIX so I can have easy raw migrations on localhost
      data.req.userId = Number.MAX_SAFE_INTEGER;
      return;
    }
    await this.taonSessionRepository.throwIfNotAuthenticated(data);
    const context = await this.taonAuthContextRepository.getContext(
      req.userId,
      req.sessionId,
    );
    if (context?.isSuperUser) {
      // ok
    } else {
      Taon.error({
        status: getStatusCode(HttpStatusEnum.FORBIDDEN),
        message: t.gettext(
          '[@taon-dev/sudo] Only super users can upload sudo files.',
        ),
      });
    }
    //#endregion
  }
  //#endregion

  //#region methods / authorize multipart upload
  protected override async authorizeMultipartUpload(): Promise<boolean> {
    //#region @backendFunc
    // Super-user access is enforced for every operation in beforeEachRequest.
    return true;
    //#endregion
  }
  //#endregion

  afterFileUploadHook(): void {}

  //#region methods / assert staged key
  assertStagedKey(key: string): void {
    //#region @backendFunc
    if (typeof key !== 'string' || !STAGED_UPLOAD_KEY_REGEX.test(key)) {
      Taon.error({
        status: getStatusCode(HttpStatusEnum.BAD_REQUEST),
        message: 'The uploaded file key is invalid.',
      });
    }
    //#endregion
  }
  //#endregion

  //#region methods / get staged object
  async getStagedObject(key: string): Promise<TaonStorageObject> {
    //#region @backendFunc
    this.assertStagedKey(key);
    const object = await Taon.getResponseValue(this.getMetadata(key));
    if (!object) {
      Taon.error({
        status: getStatusCode(HttpStatusEnum.NOT_FOUND),
        message: 'The uploaded file was not found. Please upload it again.',
      });
    }
    return object!;
    //#endregion
  }
  //#endregion

  //#region methods / staged object location
  /**
   * Cloudflare: R2 bucket + object key, Node.js: absolute file path.
   */
  stagedObjectLocation(key: string): {
    r2Bucket?: R2Bucket;
    keyOrPath: string;
  } {
    //#region @backendFunc
    this.assertStagedKey(key);
    const controllerName = ClassHelpers.getName(this);
    if (UtilsOs.isRunningInCloudflareWorker()) {
      if (!this.ctx.R2) {
        Taon.error({
          status: getStatusCode(HttpStatusEnum.INTERNAL_SERVER_ERROR),
          message: `Context "${this.ctx.contextName}" has no configured R2 bucket.`,
        });
      }
      return {
        r2Bucket: this.ctx.R2,
        keyOrPath: `${controllerName}/${key}`,
      };
    }
    return {
      keyOrPath: path.resolve(
        this.ctx.bucketFileDbLocationBase,
        controllerName,
        key,
      ),
    };
    //#endregion
  }
  //#endregion

  //#region methods / delete staged object
  async deleteStagedObject(key: string): Promise<void> {
    //#region @backendFunc
    this.assertStagedKey(key);
    await Taon.getResponseValue(this.delete(key));
    //#endregion
  }
  //#endregion

  //#region methods / build storage download url
  buildStorageDownloadUrl(options: {
    req: ExpressRequest;
    key: string;
    private: boolean;
    token?: string;
    download?: boolean;
  }): string {
    //#region @websqlFunc
    const url = new URL(this.getThisControllerMethodFullUrl('download'));
    url.search = '';
    url.searchParams.set('key', options.key);
    if (options.token) {
      url.searchParams.set('token', options.token);
    }
    if (options.download) {
      url.searchParams.set('download', 'true');
    }
    return url.toString();
    //#endregion
  }
  //#endregion

  //#region methods / create storage download token
  async createStorageDownloadToken(options: {
    key: string;
    expiresAt: number;
  }): Promise<string> {
    //#region @backendFunc
    return UtilsJwt.sign(
      {
        storageController: ClassHelpers.getName(this),
        key: options.key,
        expiresAt: options.expiresAt,
      },
      this.taonSessionProvider.cookies.ACCESS_TOKEN_SECRET,
      {
        expiresIn: Math.max(
          1,
          Math.ceil((options.expiresAt - Date.now()) / 1000),
        ),
      },
    );
    //#endregion
  }
  //#endregion

  //#region methods / verify storage download token
  protected override async verifyStorageDownloadToken(options: {
    key: string;
    token: string;
  }): Promise<boolean> {
    //#region @backendFunc
    try {
      const payload = await UtilsJwt.verify(
        options.token,
        this.taonSessionProvider.cookies.ACCESS_TOKEN_SECRET,
      );
      return (
        payload.storageController === ClassHelpers.getName(this) &&
        payload.key === options.key &&
        typeof payload.expiresAt === 'number' &&
        payload.expiresAt > Date.now()
      );
    } catch {
      return false;
    }
    //#endregion
  }
  //#endregion
}
