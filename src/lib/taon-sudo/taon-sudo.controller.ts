//#region imports
import { Translation } from '@taon-dev/i18n/src';
import { TaonAuthContextRepository } from '@taon-dev/session/src';
import {
  Taon,
  ClassHelpers,
  TaonController,
  TaonBaseCrudController,
  TaonBaseStorageController,
  TaonBaseController,
  GET,
  Models,
  getStatusCode,
  HttpStatusEnum,
  TaonStorageObject,
  ContextsEndpointStorage,
  EndpointContext,
} from 'taon/src';
import { _ } from 'tnp-core/src';

import { TaonSudoRepository } from './taon-sudo.repository';
//#endregion

const t = Translation.for(Taon.__FILE_RELATIVE_PATH, Taon.LANG_IMPORT_MAP);

@TaonController<TaonSudoController>({
  className: 'TaonSudoController',
  // allowedMethods: []
})
export class TaonSudoController extends TaonBaseController<
  {},
  TaonSudoController
> {
  //#region fields & getters
  protected readonly taonSudoRepository =
    this.injectCustomRepo(TaonSudoRepository);

  protected readonly taonAuthContextRepository = this.injectCustomRepo(
    TaonAuthContextRepository,
  );
  //#endregion

  get allContextsName(): string[] {
    return this.allContexts?.map(c => c.contextName) || [];
  }

  private allContexts: EndpointContext[] = [];

  protected async afterAllCtxInited(options: {
    ctxStorage: ContextsEndpointStorage;
  }): Promise<void> {
    const contexts = options.ctxStorage.arr;

    /**
     contexts[0].R2; // cloudflare r2 instance for specyfic contexts
     // root keys are here TaonBaseStorageController classes instances names

     contexts[0].bucketFileDbLocationBase
     // root folders are here TaonBaseStorageController classes instances names
    */

    this.allContexts = contexts;
  }

  //#region authenticaiton
  protected async beforeEachRequest({
    req,
    res,
  }: Models.TaonCtrlBeforeEachRequestParams<TaonSudoController>): Promise<void> {
    const context = await this.taonAuthContextRepository.getContext(
      req.userId,
      req.sessionId,
    );

    if (context.isSuperUser || context.isLocalhostBackend) {
      // OK
    } else {
      Taon.error({
        status: getStatusCode(HttpStatusEnum.FORBIDDEN),
        message: t.gettext('Only super users can access super user stuff'),
      });
    }
  }
  //#endregion

  //#region methods / get all entities
  @GET()
  exmpleMethod(): Taon.Response<any[]> {
    //#region @backendFunc
    return async (req, res) => {
      // TODO
      return [];
    };
    //#endregion
  }
  //#endregion
}
