//#region imports
import { Translation } from '@taon-dev/i18n/src';
import {
  TaonAuthContextRepository,
  TaonSessionRepository,
} from '@taon-dev/session/src';
import {
  Taon,
  ClassHelpers,
  TaonController,
  TaonBaseStorageController,
  TaonBaseKvRepository,
  TaonBaseKvSyncRepository,
  TaonBaseController,
  GET,
  Models,
  getStatusCode,
  HttpStatusEnum,
  TaonStorageObject,
  ContextsEndpointStorage,
  EndpointContext,
  Body,
  Query,
  POST,
  PUT,
  DELETE,
  TAON_MIGRATION_META_TABLE_NAME,
} from 'taon/src';
import type { EntityMetadata, Repository } from 'taon-typeorm/src';
import { FetchResponseType } from 'ng2-rest/src';

import { TaonSudoRepository } from './taon-sudo.repository';
import { TaonSudoUtils } from './taon-sudo.utils';
import { TaonSudoModels } from './taon-sudo.models';
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

  protected readonly taonSessionRepository = this.injectCustomRepo(
    TaonSessionRepository,
  );

  get allContextsName(): string[] {
    return this.allContexts?.map(c => c.contextName) || [];
  }

  private allContexts: EndpointContext[] = [];
  //#endregion

  //#region methods / after all ctx inited
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
  //#endregion

  //#region authenticaiton
  protected async beforeEachRequest(
    data: Models.TaonCtrlBeforeEachRequestParams<TaonSudoController>,
  ): Promise<void> {
    await this.taonSessionRepository.throwIfNotAuthenticated(data);
    const { req } = data || {};
    const context = await this.taonAuthContextRepository.getContext(
      req.userId,
      req.sessionId,
    );
    // console.log({ userId: req.userId, sessionId: req.sessionId });
    // console.log('context sudo data', context);
    if (context.isSuperUser || context.isLocalhostBackend) {
      /// OK for super user
    } else {
      Taon.error({
        status: getStatusCode(HttpStatusEnum.FORBIDDEN),
        message: t.gettext(
          '[@taon-dev/sudo] Only super users can access super user stuff',
        ),
      });
    }
  }
  //#endregion

  //#region methods / get context
  private getContext(contextName: string): EndpointContext {
    const context = this.allContexts.find(
      item => item.contextName === contextName,
    );
    if (!context) {
      Taon.error({
        status: getStatusCode(HttpStatusEnum.NOT_FOUND),
        message: `Taon context "${contextName}" was not found.`,
      });
    }
    return context!;
  }
  //#endregion

  //#region methods / get context
  @GET()
  getAllContextsData(): Taon.Response<TaonSudoModels.BasicContextData[]> {
    //#region @websqlFunc
    return async (req, res) => {
      return this.allContexts.map(c => {
        return {
          backendUrlOrigin: c.uriOrigin!,
          frontendUriOrigin: c.frontendHostUri.origin,
          contextName: c.contextName,
        };
      });
    };
    //#endregion
  }
  //#endregion

  //#region methods / get sql entity
  private getSqlEntity(
    contextName: string,
    entityName: string,
    opt?: {
      filterClassEntitesOnly?: boolean;
      skipThrowWhenNotClassMetadata?: boolean;
    },
  ): { context: EndpointContext; repository: Repository<any> } {
    //#region @websqlFunc
    opt = opt || {};
    opt.filterClassEntitesOnly = !!opt.filterClassEntitesOnly;
    opt.skipThrowWhenNotClassMetadata = !!opt.skipThrowWhenNotClassMetadata;

    const context = this.getContext(contextName);
    if (!context.connection) {
      Taon.error({
        status: getStatusCode(HttpStatusEnum.BAD_REQUEST),
        message: `Context "${contextName}" does not have an initialized SQL connection.`,
      });
    }
    let metadata: EntityMetadata;
    if (opt.filterClassEntitesOnly) {
      const registeredEntityNames = new Set(
        context
          .getClassFunByArr(Models.ClassType.ENTITY)
          .map(classFn => ClassHelpers.getName(classFn)),
      );
      metadata = context.connection.entityMetadatas.find(
        item =>
          registeredEntityNames.has(item.name) &&
          (item.name === entityName || item.tableName === entityName),
      );
    } else {
      metadata = context.connection.entityMetadatas.find(
        item => item.name === entityName || item.tableName === entityName,
      );
    }

    if (!metadata) {
      if (opt.skipThrowWhenNotClassMetadata) {
        return { context } as any;
      }
      Taon.error({
        status: getStatusCode(HttpStatusEnum.NOT_FOUND),
        message: `SQL entity "${entityName}" was not found or is not available for raw data access.`,
      });
    }
    return {
      context,
      repository: this.taonSudoRepository.getCrudRepositoryForContext(
        context,
        metadata!.name,
      ),
    };
    //#endregion
  }
  //#endregion

  //#region methods / persisted columns
  private persistedColumns(
    repository: Repository<any>,
    opt?: { includeVirtual?: boolean },
  ) {
    //#region @websqlFunc
    opt = opt || {};
    opt.includeVirtual = !!opt.includeVirtual;
    const columns = repository.metadata.columns;
    if (opt.includeVirtual) {
      return columns;
    }
    return columns.filter(
      column => !column.isVirtual && !column.isVirtualProperty,
    );
    //#endregion
  }
  //#endregion

  //#region methods / filter persisted values
  private filterPersistedValues(
    repository: Repository<any>,
    value: unknown,
    includeGenerated: boolean,
  ): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      Taon.error({
        status: getStatusCode(HttpStatusEnum.BAD_REQUEST),
        message: 'A row object is required.',
      });
    }
    const input = value as Record<string, unknown>;
    const allowed = this.persistedColumns(repository).filter(
      column => includeGenerated || !column.isGenerated,
    );
    const result: Record<string, unknown> = {};
    for (const column of allowed) {
      if (Object.prototype.hasOwnProperty.call(input, column.propertyName)) {
        result[column.propertyName] = input[column.propertyName];
      }
    }
    return result;
  }
  //#endregion

  //#region methods / context and entity discovery
  @GET()
  getContexts(): Taon.Response<string[]> {
    //#region @backendFunc
    return async () => this.allContexts.map(context => context.contextName);
    //#endregion
  }

  //#region methods / get sql contexts
  @GET()
  getSqlContexts(): Taon.Response<string[]> {
    //#region @backendFunc
    return async () =>
      this.allContexts
        .filter(context => !!context.connection?.entityMetadatas.length)
        .map(context => context.contextName);
    //#endregion
  }
  //#endregion

  //#region methods / get sql entities
  @GET()
  getSqlEntities(@Query('contextName') contextName: string): Taon.Response<
    {
      name: string;
      tableName: string;
      columns: {
        name: string;
        propertyName: string;
        type: string;
        primary: boolean;
        generated: boolean;
        nullable: boolean;
      }[];
      primaryColumns: string[];
    }[]
  > {
    //#region @backendFunc
    return async () => {
      const context = this.getContext(contextName);
      if (!context.connection) {
        Taon.error({
          status: getStatusCode(HttpStatusEnum.BAD_REQUEST),
          message: `Context "${contextName}" does not have an initialized SQL connection.`,
        });
      }
      // const registeredEntityNames = new Set(
      //   context
      //     .getClassFunByArr(Models.ClassType.ENTITY)
      //     .map(classFn => ClassHelpers.getName(classFn)),
      // );
      const sqlTables = context.connection.entityMetadatas
        // .filter(metadata => registeredEntityNames.has(metadata.name))
        .map(metadata => ({
          name: metadata.name,
          tableName: metadata.tableName,
          columns: metadata.columns
            .filter(column => !column.isVirtual && !column.isVirtualProperty)
            .map(column => ({
              name: column.databaseName,
              propertyName: column.propertyName,
              type:
                typeof column.type === 'string'
                  ? column.type
                  : column.type?.name || 'text',
              primary: column.isPrimary,
              generated: column.isGenerated,
              nullable: column.isNullable,
            })),
          primaryColumns: metadata.primaryColumns.map(
            column => column.databaseName,
          ),
        }));

      return [
        ...sqlTables,
        {
          name: TAON_MIGRATION_META_TABLE_NAME,
          tableName: TAON_MIGRATION_META_TABLE_NAME,
          columns: this.ctx.dbMigrations.table.columns.map(c => {
            return {
              generated: c.isGenerated,
              nullable: c.isNullable,
              name: c.name,
              primary: c.isPrimary,
              propertyName: c.name,
              type: c.type,
            };
          }),
          primaryColumns: ['id'],
        },
      ];
    };
    //#endregion
  }
  //#endregion
  //#endregion

  //#region methods / SQL rows
  @GET()
  getSqlRows(
    @Query('contextName') contextName: string,
    @Query('entityName') entityName: string,
    @Query('page') page = 0,
    @Query('pageSize') pageSize = 25,
  ): Taon.Response<{
    columns: {
      name: string;
      propertyName: string;
      primary: boolean;
      generated: boolean;
      nullable: boolean;
    }[];
    rows: Record<string, unknown>[];
    totalCount: number;
  }> {
    //#region @websqlFunc
    return async () => {
      const safePage = Math.max(0, Math.floor(Number(page) || 0));
      const safePageSize = Math.min(
        100,
        Math.max(1, Math.floor(Number(pageSize) || 25)),
      );

      //#region migration meta table

      if (entityName === TAON_MIGRATION_META_TABLE_NAME) {
        const context = this.getContext(contextName);

        if (!context.connection) {
          Taon.error({
            status: getStatusCode(HttpStatusEnum.BAD_REQUEST),
            message: `Context "${contextName}" does not have an initialized SQL connection.`,
          });
        }

        const table = this.ctx.dbMigrations.table;

        const columns = table.columns.map(column => ({
          name: column.name,
          propertyName: column.name,
          primary: column.isPrimary,
          generated: column.isGenerated,
          nullable: column.isNullable,
        }));

        const queryRunner = context.connection!.createQueryRunner();

        try {
          await queryRunner.connect();

          const driver = queryRunner.connection.driver;
          const escapedTableName = driver.escape(
            TAON_MIGRATION_META_TABLE_NAME,
          );

          const rows = await queryRunner.query(`
        SELECT *
        FROM ${escapedTableName}
        ORDER BY ${driver.escape('id')} ASC
        LIMIT ${safePageSize}
        OFFSET ${safePage * safePageSize}
      `);

          const countResult = await queryRunner.query(`
        SELECT COUNT(*) AS count
        FROM ${escapedTableName}
      `);

          return {
            columns,
            rows: rows as Record<string, unknown>[],
            totalCount: Number(countResult?.[0]?.count || 0),
          };
        } finally {
          await queryRunner.release();
        }
      }

      //#endregion

      //#region typeorm tables

      const { repository } = this.getSqlEntity(contextName, entityName);

      const classRepo = this.getSqlEntity(contextName, entityName, {
        skipThrowWhenNotClassMetadata: true,
        filterClassEntitesOnly: true,
      });

      const columns = this.persistedColumns(repository, {
        includeVirtual: !classRepo.repository,
      });

      const context = this.getContext(contextName);

      if (!context.connection) {
        Taon.error({
          status: getStatusCode(HttpStatusEnum.BAD_REQUEST),
          message: `Context "${contextName}" does not have an initialized SQL connection.`,
        });
      }

      const queryRunner = context.connection!.createQueryRunner();

      try {
        await queryRunner.connect();

        const driver = queryRunner.connection.driver;
        const metadata = repository.metadata;

        const escapedTableName = driver.escape(metadata.tableName);

        const primaryColumns = metadata.primaryColumns;

        if (!primaryColumns.length) {
          throw new Error(
            `SQL table "${metadata.tableName}" has no primary key; stable pagination is not available.`,
          );
        }

        const orderBy = primaryColumns
          .map(column => `${driver.escape(column.databaseName)} ASC`)
          .join(', ');

        const rows: Record<string, unknown>[] = await queryRunner.query(`
      SELECT *
      FROM ${escapedTableName}
      ORDER BY ${orderBy}
      LIMIT ${safePageSize}
      OFFSET ${safePage * safePageSize}
    `);

        const countResult = await queryRunner.query(`
      SELECT COUNT(*) AS count
      FROM ${escapedTableName}
    `);

        return {
          columns: columns.map(column => ({
            name: column.databaseName,
            propertyName: column.propertyName,
            primary: column.isPrimary,
            generated: column.isGenerated,
            nullable: column.isNullable,
          })),
          rows,
          totalCount: Number(countResult?.[0]?.count || 0),
        };
      } finally {
        await queryRunner.release();
      }

      //#endregion
    };
    //#endregion
  }

  //#region methods / add sql row
  @POST()
  addSqlRow(
    @Query('contextName') contextName: string,
    @Query('entityName') entityName: string,
    @Body('row') row: Record<string, unknown>,
  ): Taon.Response<Record<string, unknown>> {
    //#region @backendFunc
    return async () => {
      const { repository } = this.getSqlEntity(contextName, entityName);
      const values = this.filterPersistedValues(repository, row, false);
      return await repository.save(repository.create(values));
    };
    //#endregion
  }
  //#endregion

  //#region methods / edit sql row
  @PUT()
  editSqlRow(
    @Query('contextName') contextName: string,
    @Query('entityName') entityName: string,
    @Body('primaryKey') primaryKey: Record<string, unknown>,
    @Body('row') row: Record<string, unknown>,
  ): Taon.Response<boolean> {
    //#region @backendFunc
    return async () => {
      const { repository } = this.getSqlEntity(contextName, entityName);
      const key = this.filterPersistedValues(repository, primaryKey, true);
      const primaryColumns = repository.metadata.primaryColumns;
      if (
        primaryColumns.length === 0 ||
        primaryColumns.some(
          column =>
            !Object.prototype.hasOwnProperty.call(key, column.propertyName),
        )
      ) {
        Taon.error({
          status: getStatusCode(HttpStatusEnum.BAD_REQUEST),
          message: 'A complete primary key is required to edit this row.',
        });
      }
      const values = this.filterPersistedValues(repository, row, false);
      const result = await repository.update(key, values);
      return !!result.affected;
    };
    //#endregion
  }
  //#endregion

  //#region methods / delete sql row
  @DELETE()
  deleteSqlRow(
    @Query('contextName') contextName: string,
    @Query('entityName') entityName: string,
    @Body('primaryKey') primaryKey: Record<string, unknown>,
  ): Taon.Response<boolean> {
    //#region @backendFunc
    return async () => {
      const { repository } = this.getSqlEntity(contextName, entityName);
      const key = this.filterPersistedValues(repository, primaryKey, true);
      const primaryColumns = repository.metadata.primaryColumns;
      if (
        primaryColumns.length === 0 ||
        primaryColumns.some(
          column =>
            !Object.prototype.hasOwnProperty.call(key, column.propertyName),
        )
      ) {
        Taon.error({
          status: getStatusCode(HttpStatusEnum.BAD_REQUEST),
          message: 'A complete primary key is required to delete this row.',
        });
      }
      const result = await repository.delete(key);
      return !!result.affected;
    };
    //#endregion
  }
  //#endregion
  //#endregion

  //#region methods / KV repositories
  private getKvRepository(
    contextName: string,
    repositoryName: string,
  ): TaonBaseKvRepository | TaonBaseKvSyncRepository {
    const context = this.getContext(contextName);
    const classFn = context.getClassFunByClassName(repositoryName);
    if (
      !classFn ||
      (classFn !== TaonBaseKvRepository &&
        classFn !== TaonBaseKvSyncRepository &&
        !(classFn.prototype instanceof TaonBaseKvRepository) &&
        !(classFn.prototype instanceof TaonBaseKvSyncRepository))
    ) {
      Taon.error({
        status: getStatusCode(HttpStatusEnum.NOT_FOUND),
        message: `KV repository "${repositoryName}" was not found in context "${contextName}".`,
      });
    }
    const instance = context.getInstanceBy(classFn as any);
    if (
      !(instance instanceof TaonBaseKvRepository) &&
      !(instance instanceof TaonBaseKvSyncRepository)
    ) {
      Taon.error({
        status: getStatusCode(HttpStatusEnum.BAD_REQUEST),
        message: `"${repositoryName}" is not a supported KV repository.`,
      });
    }
    return instance as TaonBaseKvRepository | TaonBaseKvSyncRepository;
  }

  //#region methods / get kv repositories
  @GET()
  getKvRepositories(
    @Query('contextName') contextName: string,
  ): Taon.Response<string[]> {
    //#region @backendFunc
    return async () => {
      const context = this.getContext(contextName);
      return context
        .getClassFunByArr(Models.ClassType.REPOSITORY)
        .filter(
          classFn =>
            classFn.prototype instanceof TaonBaseKvRepository ||
            classFn.prototype instanceof TaonBaseKvSyncRepository,
        )
        .map(classFn => ClassHelpers.getName(classFn));
    };
    //#endregion
  }
  //#endregion

  //#region methods / get kv data
  @GET()
  getKvData(
    @Query('contextName') contextName: string,
    @Query('repositoryName') repositoryName: string,
  ): Taon.Response<{ key: string; value: unknown }[]> {
    //#region @backendFunc
    return async () => {
      const repository = this.getKvRepository(contextName, repositoryName);
      const data = await repository.getAllData();
      return Object.entries(data).map(([key, value]) => ({ key, value }));
    };
    //#endregion
  }
  //#endregion

  //#region methods / set kv value
  @POST()
  setKvValue(
    @Query('contextName') contextName: string,
    @Query('repositoryName') repositoryName: string,
    @Body('key') key: string,
    @Body('value') value: unknown,
  ): Taon.Response<boolean> {
    //#region @backendFunc
    return async () => {
      if (!key) {
        Taon.error({
          status: getStatusCode(HttpStatusEnum.BAD_REQUEST),
          message: 'A non-empty KV key is required.',
        });
      }
      const repository = this.getKvRepository(contextName, repositoryName);
      if (repository instanceof TaonBaseKvSyncRepository) {
        repository.set(key, value);
      } else {
        await repository.set(key, value);
      }
      return true;
    };
    //#endregion
  }
  //#endregion

  //#region methods / delete kv value
  @DELETE()
  deleteKvValue(
    @Query('contextName') contextName: string,
    @Query('repositoryName') repositoryName: string,
    @Body('key') key: string,
  ): Taon.Response<boolean> {
    //#region @backendFunc
    return async () => {
      if (!key) {
        Taon.error({
          status: getStatusCode(HttpStatusEnum.BAD_REQUEST),
          message: 'A non-empty KV key is required.',
        });
      }
      const repository = this.getKvRepository(contextName, repositoryName);
      if (repository instanceof TaonBaseKvSyncRepository) {
        repository.delete(key);
      } else {
        await repository.delete(key);
      }
      return true;
    };
    //#endregion
  }
  //#endregion
  //#endregion

  //#region methods / bucket controllers
  private getStorageController(
    contextName: string,
    controllerName: string,
  ): TaonBaseStorageController {
    const context = this.getContext(contextName);
    const classFn = context.getClassFunByClassName(controllerName);
    if (
      !classFn ||
      (classFn !== TaonBaseStorageController &&
        !(classFn.prototype instanceof TaonBaseStorageController))
    ) {
      Taon.error({
        status: getStatusCode(HttpStatusEnum.NOT_FOUND),
        message: `Storage controller "${controllerName}" was not found in context "${contextName}".`,
      });
    }
    return context.getInstanceBy(classFn as any) as TaonBaseStorageController;
  }

  //#region methods / get storage controllers
  @GET()
  getStorageControllers(
    @Query('contextName') contextName: string,
  ): Taon.Response<string[]> {
    //#region @backendFunc
    return async () => {
      const context = this.getContext(contextName);
      return context
        .getClassFunByArr(Models.ClassType.CONTROLLER)
        .filter(
          classFn =>
            classFn === TaonBaseStorageController ||
            classFn.prototype instanceof TaonBaseStorageController,
        )
        .map(classFn => ClassHelpers.getName(classFn));
    };
    //#endregion
  }
  //#endregion

  //#region methods / get bucket files
  @GET()
  getBucketFiles(
    @Query('contextName') contextName: string,
    @Query('controllerName') controllerName: string,
  ): Taon.Response<TaonStorageObject[]> {
    //#region @backendFunc
    return async () => {
      const controller = this.getStorageController(contextName, controllerName);
      return await controller.list({})();
    };
    //#endregion
  }
  //#endregion

  //#region methods / delete bucket file
  @DELETE()
  deleteBucketFile(
    @Query('contextName') contextName: string,
    @Query('controllerName') controllerName: string,
    @Body('key') key: string,
  ): Taon.Response<boolean> {
    //#region @backendFunc
    return async () => {
      const controller = this.getStorageController(contextName, controllerName);
      return await controller.delete(key)();
    };
    //#endregion
  }
  //#endregion

  //#region methods / upload bucket file
  @POST({
    overrideContentType: 'multipart/form-data',
  })
  uploadBucketFile(
    @Query('contextName') contextName: string,
    @Query('controllerName') controllerName: string,
    @Body() formData: FormData,
  ): Taon.Response<TaonStorageObject[]> {
    //#region @backendFunc
    return async (req, res, results) => {
      const bodyFormDataFiles = results?.bodyFormDataFiles;
      if (!bodyFormDataFiles?.length) {
        Taon.error({
          status: getStatusCode(HttpStatusEnum.BAD_REQUEST),
          message: 'An upload file is required.',
        });
      }
      const controller = this.getStorageController(contextName, controllerName);
      return await controller.uploadFormDataToServer(formData)(req, res, {
        bodyFormDataFiles: bodyFormDataFiles!,
        t,
        expressPath: '',
      });
    };
    //#endregion
  }
  //#endregion

  //#region methods / download bucket file
  @GET({
    overrideResponseType: FetchResponseType.Stream,
  })
  downloadBucketFile(
    @Query('contextName') contextName: string,
    @Query('controllerName') controllerName: string,
    @Query('key') key: string,
    @Query('download') download = false,
  ): Taon.Response<ReadableStream<Uint8Array>> {
    //#region @backendFunc
    return async (req, res) => {
      const controller = this.getStorageController(contextName, controllerName);
      const privateUrl = await controller.getPrivateUrl(key, {
        expiresInSeconds: 5 * 60,
      })(req, res);
      if (typeof privateUrl !== 'string') {
        throw new Error('Storage download URL could not be generated.');
      }
      const token = new URL(privateUrl).searchParams.get('token') || undefined;
      return await controller.download(key, token, download)(req, res);
    };
    //#endregion
  }
  //#endregion
  //#endregion
}
