//#region imports
import { Translation } from '@taon-dev/i18n/src';
import { TaonAuthContextRepository } from '@taon-dev/session/src';
import { FetchResponseType } from 'ng2-rest/src';
import {
  ContextsEndpointStorage,
  EndpointContext,
  GET,
  POST,
  DELETE,
  Body,
  Query,
  Taon,
  TaonBaseController,
  TaonController,
  Models,
  getStatusCode,
  HttpStatusEnum,
  TaonBaseFileUploadMiddleware,
} from 'taon/src';
import { UtilsOs } from 'tnp-core/src';

import {
  TaonSudoRawMigrationJob,
  TaonSudoRawMigrationJobUpdate,
  TaonSudoRawMigrationSummary,
} from './taon-sudo-raw-migration.models';
import { TaonSudoRawMigrationRepository } from './taon-sudo-raw-migration.repository';
//#endregion

const t = Translation.for(Taon.__FILE_RELATIVE_PATH, Taon.LANG_IMPORT_MAP);

interface ActiveMigrationJob extends TaonSudoRawMigrationJob {
  stopRequested: boolean;
}

@TaonController<TaonSudoRawMigrationController>({
  className: 'TaonSudoRawMigrationController',
})
export class TaonSudoRawMigrationController extends TaonBaseController<
  {},
  TaonSudoRawMigrationController
> {
  //#region fields & getters
  private readonly rawMigrationRepository = this.injectCustomRepo(
    TaonSudoRawMigrationRepository,
  );

  private readonly authRepository = this.injectCustomRepo(
    TaonAuthContextRepository,
  );

  private readonly jobs = new Map<string, ActiveMigrationJob>();

  private contexts: EndpointContext[] = [];
  //#endregion

  //#region methods / after all ctx inited
  protected async afterAllCtxInited(options: {
    ctxStorage: ContextsEndpointStorage;
  }): Promise<void> {
    this.contexts = options.ctxStorage.arr;
  }
  //#endregion

  //#region methods / before each request
  protected async beforeEachRequest({
    req,
  }: Models.TaonCtrlBeforeEachRequestParams<TaonSudoRawMigrationController>): Promise<void> {
    const context = await this.authRepository.getContext(
      req.userId,
      req.sessionId,
    );
    if (context.isSuperUser || context.isLocalhostBackend) {
      // OK for super user
    } else {
      Taon.error({
        status: getStatusCode(HttpStatusEnum.FORBIDDEN),
        message: t.gettext('[@taon-dev/sudo] Only super users can access raw migrations.'),
      });
    }
  }
  //#endregion

  //#region methods / get raw migration contexts
  @GET()
  getRawMigrationContexts(): Taon.Response<string[]> {
    //#region @backendFunc
    return async () => this.contexts.map(context => context.contextName);
    //#endregion
  }
  //#endregion

  //#region methods / get raw migration snapshots
  @GET()
  getRawMigrationSnapshots(
    @Query('contextName') contextName: string,
  ): Taon.Response<TaonSudoRawMigrationSummary[]> {
    //#region @backendFunc
    return async () =>
      this.rawMigrationRepository.listSnapshots(this.getContext(contextName));
    //#endregion
  }
  //#endregion

  //#region methods / create raw migration snapshot
  @POST()
  createRawMigrationSnapshot(
    @Query('contextName') contextName: string,
    @Query('name') name: string,
  ): Taon.Response<TaonSudoRawMigrationJob> {
    //#region @backendFunc
    return async () => {
      const context = this.getContext(contextName);
      const job = this.createJob('create', contextName);
      const execute = () =>
        this.rawMigrationRepository.createSnapshot(context, name, {
          onProgress: update => this.updateJob(job, update),
          isCancelled: () => job.stopRequested,
        });
      await this.runJob(job, execute);
      return this.publicJob(job);
    };
    //#endregion
  }
  //#endregion

  //#region methods / get raw migration job
  @GET()
  getRawMigrationJob(
    @Query('jobId') jobId: string,
  ): Taon.Response<TaonSudoRawMigrationJob> {
    //#region @backendFunc
    return async () => {
      const job = this.jobs.get(jobId);
      if (!job) {
        Taon.error({
          status: getStatusCode(HttpStatusEnum.NOT_FOUND),
          message: `Raw migration job "${jobId}" was not found.`,
        });
      }
      return this.publicJob(job!);
    };
    //#endregion
  }
  //#endregion

  //#region methods / stop raw migration job
  @POST()
  stopRawMigrationJob(@Query('jobId') jobId: string): Taon.Response<boolean> {
    //#region @backendFunc
    return async () => {
      const job = this.jobs.get(jobId);
      if (
        !job ||
        job.operation !== 'create' ||
        job.status !== 'running' ||
        UtilsOs.isRunningInCloudflareWorker()
      ) {
        return false;
      }
      job.stopRequested = true;
      job.phase = 'Stopping after the current safe operation';
      return true;
    };
    //#endregion
  }
  //#endregion

  //#region methods / restore raw migration snapshot
  @POST()
  restoreRawMigrationSnapshot(
    @Query('contextName') contextName: string,
    @Query('snapshotId') snapshotId: string,
    @Query('clearAllData') clearAllData?: boolean,
  ): Taon.Response<TaonSudoRawMigrationJob> {
    //#region @backendFunc
    return async () => {
      const context = this.getContext(contextName);
      const job = this.createJob('restore', contextName, snapshotId);
      await this.runJob(job, () =>
        this.rawMigrationRepository.restoreSnapshot(context, snapshotId, {
          jobId: job.id,
          clearAllData: clearAllData === true,
          onProgress: update => this.updateJob(job, update),
        }),
      );
      return this.publicJob(job);
    };
    //#endregion
  }
  //#endregion

  //#region methods / delete raw migration snapshot
  @DELETE()
  deleteRawMigrationSnapshot(
    @Query('contextName') contextName: string,
    @Query('snapshotId') snapshotId: string,
  ): Taon.Response<boolean> {
    //#region @backendFunc
    return async () => {
      await this.rawMigrationRepository.deleteSnapshot(
        this.getContext(contextName),
        snapshotId,
      );
      return true;
    };
    //#endregion
  }
  //#endregion

  //#region methods / export raw migration snapshot
  @GET({
    overrideResponseType: FetchResponseType.Stream,
  })
  exportRawMigrationSnapshot(
    @Query('contextName') contextName: string,
    @Query('snapshotId') snapshotId: string,
  ): Taon.Response<ReadableStream<Uint8Array>> {
    //#region @backendFunc
    return async (req, res) => {
      const stream = await this.rawMigrationRepository.exportSnapshot(
        this.getContext(contextName),
        snapshotId,
      );
      if (!res) {
        throw new Error('The ZIP export response is unavailable.');
      }
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="raw-migration-${snapshotId}.zip"`,
      );
      return stream;
    };
    //#endregion
  }
  //#endregion

  //#region methods / import raw migration snapshot
  @POST({
    overrideContentType: 'multipart/form-data',
    middlewares: ({ parentMiddlewares }) => ({
      ...parentMiddlewares,
      TaonBaseFileUploadMiddleware,
    }),
  })
  importRawMigrationSnapshot(
    @Query('contextName') contextName: string,
    @Query('name') name: string,
    @Body() _formData: FormData,
  ): Taon.Response<TaonSudoRawMigrationSummary> {
    //#region @backendFunc
    return async (_req, _res, results) => {
      const file = results?.bodyFormDataFiles?.find(
        uploadedFile => uploadedFile.fieldName === 'file',
      );
      if (!file) {
        Taon.error({
          status: getStatusCode(HttpStatusEnum.BAD_REQUEST),
          message: 'A raw migration ZIP file is required.',
        });
        throw new Error('A raw migration ZIP file is required.');
      }
      return await this.rawMigrationRepository.importSnapshot(
        this.getContext(contextName),
        file,
        name,
      );
    };
    //#endregion
  }
  //#endregion

  //#region methods / create job
  private createJob(
    operation: TaonSudoRawMigrationJob['operation'],
    contextName: string,
    snapshotId: string = crypto.randomUUID(),
  ): ActiveMigrationJob {
    if (this.jobs.size >= 100) {
      for (const [jobId, existingJob] of this.jobs) {
        if (existingJob.status !== 'running') {
          this.jobs.delete(jobId);
          if (this.jobs.size < 100) {
            break;
          }
        }
      }
    }
    const job: ActiveMigrationJob = {
      id: crypto.randomUUID(),
      snapshotId,
      contextName,
      operation,
      status: 'running',
      phase: operation === 'create' ? 'Starting snapshot' : 'Staging restore',
      completed: 0,
      total: 0,
      stopRequested: false,
    };
    this.jobs.set(job.id, job);
    return job;
  }
  //#endregion

  //#region methods / run job
  private async runJob(
    job: ActiveMigrationJob,
    run: () => Promise<string | void>,
  ): Promise<void> {
    //#region @backendFunc
    const execute = async () => {
      try {
        const result = await run();
        if (result) {
          job.snapshotId = result;
        }
        job.status = job.stopRequested ? 'cancelled' : 'completed';
        job.phase =
          job.status === 'cancelled' ? 'Snapshot stopped' : 'Completed';
      } catch (error) {
        if (
          job.operation === 'create' &&
          job.stopRequested &&
          error instanceof Error &&
          error.name === 'RawMigrationCancelledError'
        ) {
          job.status = 'cancelled';
          job.phase = 'Snapshot stopped';
          return;
        }
        job.status = 'failed';
        job.phase = 'Failed';
        job.error =
          error instanceof Error ? error.message : 'Raw migration failed.';
      }
    };

    if (UtilsOs.isRunningInCloudflareWorker()) {
      await execute();
      return;
    }
    void execute();
    //#endregion
  }
  //#endregion

  //#region methods / update job
  private updateJob(
    job: ActiveMigrationJob,
    update: TaonSudoRawMigrationJobUpdate,
  ): void {
    //#region @backendFunc
    job.phase = update.phase;
    if (update.completed !== undefined) {
      job.completed = update.completed;
    }
    if (update.total !== undefined) {
      job.total = update.total;
    }
    //#endregion
  }
  //#endregion

  //#region methods / public job
  private publicJob(job: ActiveMigrationJob): TaonSudoRawMigrationJob {
    //#region @backendFunc
    const { stopRequested: _stopRequested, ...publicJob } = job;
    return { ...publicJob };
    //#endregion
  }
  //#endregion

  //#region methods / get context
  private getContext(contextName: string): EndpointContext {
    //#region @backendFunc
    const context = this.contexts.find(
      item => item.contextName === contextName,
    );
    if (!context) {
      Taon.error({
        status: getStatusCode(HttpStatusEnum.NOT_FOUND),
        message: `Taon context "${contextName}" was not found.`,
      });
    }
    return context!;
    //#endregion
  }
  //#endregion
}
