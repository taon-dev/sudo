//#region imports
import type { R2Bucket } from '@cloudflare/workers-types';
import {
  TaonBaseCustomRepository,
  TaonRepository,
  Models,
  ClassHelpers,
  TaonBaseKvSyncRepository,
  TaonBaseKvRepository,
  EndpointContext,
  Taon,
  getStatusCode,
  HttpStatusEnum,
} from 'taon/src';
import { Repository } from 'taon-typeorm/src';
import type { QueryRunner, Table, TableColumn } from 'taon-typeorm/src';
import { fse, path, UtilsOs } from 'tnp-core/src';

import { TaonSudoModels } from './taon-sudo.models';
//#endregion

/**
 * TypeORM driver types that use the sqlite dialect (including Cloudflare D1).
 */
const SQLITE_FAMILY_DRIVERS = [
  'sqlite',
  'better-sqlite3',
  'sqljs',
  'd1',
  'capacitor',
  'cordova',
  'react-native',
  'nativescript',
  'expo',
];

const RAW_SQL_PARAM_PREFIX = 'taonSudoParam';

@TaonRepository({
  className: 'TaonSudoRepository',
})
export class TaonSudoRepository extends TaonBaseCustomRepository {
  //#region methods / get crud repository for context
  getCrudRepositoryForContext(
    context: EndpointContext,
    className: string,
  ): Repository<any> {
    //#region @websqlFunc
    // const classFun = context.getClassFunByClassName(className);
    // if (!classFun || !context.connection) {
    //   throw new Error(
    //     `SQL entity "${className}" is not available in context "${context.contextName}".`,
    //   );
    // }
    return context.connection.getRepository(className);
    //#endregion
  }
  //#endregion

  //#region methods / get crud repository by name
  async getCrudRepositoryByName(className: string): Promise<Repository<any>> {
    //#region @websqlFunc
    const classFun = this.ctx.getClassFunByClassName(className);
    return this.ctx.connection.getRepository(classFun);
    //#endregion
  }
  //#endregion

  //#region methods / get kv repository by name
  async getKvRepositoryByName(
    className: string,
  ): Promise<TaonBaseKvRepository<any>> {
    //#region @websqlFunc
    const classFun = this.ctx.getClassFunByClassName(className);
    return this.ctx.getInstanceBy(classFun as any);
    //#endregion
  }
  //#endregion

  //#region methods / get kv sync repository by name
  async getKvSyncRepositoryByName(
    className: string,
  ): Promise<TaonBaseKvSyncRepository<any>> {
    //#region @websqlFunc
    const classFun = this.ctx.getClassFunByClassName(className);
    return this.ctx.getInstanceBy(classFun as any);
    //#endregion
  }
  //#endregion

  //#region methods / get all entites name
  async getAllEntitesName<T>(className: string): Promise<string[]> {
    //#region @websqlFunc
    const allentities = this.ctx.getClassFunByArr(Models.ClassType.ENTITY);
    return allentities.map(fn => ClassHelpers.getName(fn));
    //#endregion
  }
  //#endregion

  //#region methods / get all kv repositories names
  async getAllKVRepositoriesNames<T>(className: string): Promise<string[]> {
    //#region @websqlFunc
    const allentities = this.ctx.getClassFunByArr(Models.ClassType.REPOSITORY);
    return allentities
      .filter(classFn => {
        return (
          classFn === TaonBaseKvRepository ||
          classFn === TaonBaseKvSyncRepository ||
          classFn.prototype instanceof TaonBaseKvRepository ||
          classFn.prototype instanceof TaonBaseKvSyncRepository
        );
      })
      .map(fn => ClassHelpers.getName(fn));
    //#endregion
  }
  //#endregion

  //#region methods / raw sql / get raw sql tables
  /**
   * Tables discovered directly from the database schema
   * (works for D1 and all TypeORM drivers with schema introspection).
   */
  async getRawSqlTables(
    context: EndpointContext,
  ): Promise<TaonSudoModels.SqlTable[]> {
    //#region @websqlFunc
    return this.withQueryRunner(context, async queryRunner => {
      const tables = await this.loadRawTables(queryRunner);
      return tables.map(table => this.toSqlTable(table));
    });
    //#endregion
  }
  //#endregion

  //#region methods / raw sql / get raw sql rows
  async getRawSqlRows(
    context: EndpointContext,
    tableName: string,
    page: number,
    pageSize: number,
  ): Promise<{
    table: TaonSudoModels.SqlTable;
    rows: Record<string, unknown>[];
    totalCount: number;
  }> {
    //#region @websqlFunc
    return this.withQueryRunner(context, async queryRunner => {
      const table = await this.requireRawTable(queryRunner, tableName);
      const driver = queryRunner.connection.driver;
      const escapedTable = this.escapeTableName(queryRunner, table.name);
      const orderBy = table.primaryColumns.length
        ? `ORDER BY ${table.primaryColumns
            .map(column => `${driver.escape(column.name)} ASC`)
            .join(', ')}`
        : '';
      const safePage = Math.max(0, Math.floor(Number(page) || 0));
      const safePageSize = Math.min(
        100,
        Math.max(1, Math.floor(Number(pageSize) || 25)),
      );
      const rows: Record<string, unknown>[] = await queryRunner.query(
        `SELECT * FROM ${escapedTable} ${orderBy} LIMIT ${safePageSize} OFFSET ${safePage * safePageSize}`,
      );
      const countResult = await queryRunner.query(
        `SELECT COUNT(*) AS count FROM ${escapedTable}`,
      );
      return {
        table: this.toSqlTable(table),
        rows,
        totalCount: this.readCount(countResult),
      };
    });
    //#endregion
  }
  //#endregion

  //#region methods / raw sql / insert raw sql row
  async insertRawSqlRow(
    context: EndpointContext,
    tableName: string,
    row: Record<string, unknown>,
  ): Promise<boolean> {
    //#region @websqlFunc
    this.assertRowObject(row);
    return this.withQueryRunner(context, async queryRunner => {
      const table = await this.requireRawTable(queryRunner, tableName);
      const driver = queryRunner.connection.driver;
      const params: unknown[] = [];
      const columns: string[] = [];
      for (const column of table.columns) {
        if (
          column.isGenerated ||
          !Object.prototype.hasOwnProperty.call(row, column.name)
        ) {
          continue;
        }
        const value = this.toSqlValue(queryRunner, column, row[column.name]);
        if (value === null && column.default !== undefined) {
          // let the database apply its default value
          continue;
        }
        this.assertNullable(column, value);
        columns.push(driver.escape(column.name));
        params.push(value);
      }
      const escapedTable = this.escapeTableName(queryRunner, table.name);
      const sql = columns.length
        ? `INSERT INTO ${escapedTable} (${columns.join(', ')}) VALUES (${params
            .map((_, index) => this.parameter(queryRunner, index))
            .join(', ')})`
        : `INSERT INTO ${escapedTable} DEFAULT VALUES`;
      await queryRunner.query(sql, params);
      return true;
    });
    //#endregion
  }
  //#endregion

  //#region methods / raw sql / update raw sql row
  async updateRawSqlRow(
    context: EndpointContext,
    tableName: string,
    primaryKey: Record<string, unknown>,
    row: Record<string, unknown>,
  ): Promise<boolean> {
    //#region @websqlFunc
    this.assertRowObject(row);
    return this.withQueryRunner(context, async queryRunner => {
      const table = await this.requireRawTable(queryRunner, tableName);
      const driver = queryRunner.connection.driver;
      const params: unknown[] = [];
      const assignments: string[] = [];
      for (const column of table.columns) {
        if (
          column.isGenerated ||
          !Object.prototype.hasOwnProperty.call(row, column.name)
        ) {
          continue;
        }
        const value = this.toSqlValue(queryRunner, column, row[column.name]);
        this.assertNullable(column, value);
        params.push(value);
        assignments.push(
          `${driver.escape(column.name)} = ${this.parameter(queryRunner, params.length - 1)}`,
        );
      }
      if (!assignments.length) {
        Taon.error({
          status: getStatusCode(HttpStatusEnum.BAD_REQUEST),
          message: 'No editable column values were provided.',
        });
      }
      const where = this.buildPrimaryKeyWhere(
        queryRunner,
        table,
        primaryKey,
        params,
      );
      await this.assertSingleRow(queryRunner, table, primaryKey);
      await queryRunner.query(
        `UPDATE ${this.escapeTableName(queryRunner, table.name)} SET ${assignments.join(', ')} WHERE ${where}`,
        params,
      );
      return true;
    });
    //#endregion
  }
  //#endregion

  //#region methods / raw sql / delete raw sql row
  async deleteRawSqlRow(
    context: EndpointContext,
    tableName: string,
    primaryKey: Record<string, unknown>,
  ): Promise<boolean> {
    //#region @websqlFunc
    return this.withQueryRunner(context, async queryRunner => {
      const table = await this.requireRawTable(queryRunner, tableName);
      const params: unknown[] = [];
      const where = this.buildPrimaryKeyWhere(
        queryRunner,
        table,
        primaryKey,
        params,
      );
      await this.assertSingleRow(queryRunner, table, primaryKey);
      await queryRunner.query(
        `DELETE FROM ${this.escapeTableName(queryRunner, table.name)} WHERE ${where}`,
        params,
      );
      return true;
    });
    //#endregion
  }
  //#endregion

  //#region methods / raw sql / clear sql table
  /**
   * Deletes all rows (schema untouched, foreign keys are respected - a
   * constraint violation fails the operation instead of being bypassed).
   * @returns number of rows that existed before clearing
   */
  async clearSqlTable(
    context: EndpointContext,
    tableName: string,
  ): Promise<number> {
    //#region @websqlFunc
    return this.withQueryRunner(context, async queryRunner => {
      const table = await this.requireRawTable(queryRunner, tableName);
      const escapedTable = this.escapeTableName(queryRunner, table.name);
      const count = this.readCount(
        await queryRunner.query(`SELECT COUNT(*) AS count FROM ${escapedTable}`),
      );
      await queryRunner.query(`DELETE FROM ${escapedTable}`);
      return count;
    });
    //#endregion
  }
  //#endregion

  //#region methods / bucket / write bucket object from staged upload
  /**
   * Copies a multipart-uploaded (staged) object into another storage
   * controller bucket using the standard Taon storage layout.
   * Existing objects with the same key are atomically overwritten.
   */
  async writeBucketObjectFromStaged(options: {
    staged: { r2Bucket?: R2Bucket; keyOrPath: string };
    targetContext: EndpointContext;
    controllerName: string;
    key: string;
    size: number;
    fileName?: string;
    contentType?: string;
    metadata?: Record<string, string>;
  }): Promise<void> {
    //#region @backendFunc
    const { staged, targetContext, controllerName, key } = options;
    this.assertSafeStorageKey(key);
    const customMetadata = {
      ...(options.metadata || {}),
      ...(options.fileName ? { fileName: options.fileName } : {}),
    };
    if (UtilsOs.isRunningInCloudflareWorker()) {
      //#region @cjsRemove
      const source = await staged.r2Bucket?.get(staged.keyOrPath);
      if (!source) {
        Taon.error({
          status: getStatusCode(HttpStatusEnum.NOT_FOUND),
          message: 'The uploaded file was not found. Please upload it again.',
        });
      }
      if (!targetContext.R2) {
        Taon.error({
          status: getStatusCode(HttpStatusEnum.INTERNAL_SERVER_ERROR),
          message: `Context "${targetContext.contextName}" has no configured R2 bucket.`,
        });
      }
      const result = await targetContext.R2.put(
        `${controllerName}/${key}`,
        source!.body as any,
        {
          httpMetadata: { contentType: options.contentType },
          customMetadata,
        },
      );
      if (!result || result.size !== options.size) {
        throw new Error(
          `Bucket object "${controllerName}/${key}" was not written completely.`,
        );
      }
      //#endregion
      return;
    }
    //#region @esmRemove
    const root = path.resolve(
      targetContext.bucketFileDbLocationBase,
      controllerName,
    );
    const destination = path.resolve(root, ...key.split('/'));
    if (!destination.startsWith(`${root}${path.sep}`)) {
      Taon.error({
        status: getStatusCode(HttpStatusEnum.BAD_REQUEST),
        message: 'Invalid bucket object key.',
      });
    }
    await fse.ensureDir(path.dirname(destination));
    const temporary = `${destination}.taon-sudo-${crypto.randomUUID()}.tmp`;
    try {
      await fse.copyFile(staged.keyOrPath, temporary);
      const stat = await fse.stat(temporary);
      if (stat.size !== options.size) {
        throw new Error(
          `Bucket object "${controllerName}/${key}" was not written completely.`,
        );
      }
      await fse.writeFile(
        `${destination}.taon-meta.json`,
        JSON.stringify({
          fileName: options.fileName,
          contentType: options.contentType,
          metadata: options.metadata,
        }),
        'utf8',
      );
      await fse.rename(temporary, destination);
    } finally {
      await fse.remove(temporary);
    }
    //#endregion
    //#endregion
  }
  //#endregion

  //#region methods / bucket / assert safe storage key
  assertSafeStorageKey(key: string): void {
    //#region @websqlFunc
    if (
      typeof key !== 'string' ||
      !key ||
      key.length > 1024 ||
      key.startsWith('/') ||
      key.includes('\\') ||
      key.includes('\0') ||
      key.endsWith('.taon-meta.json') ||
      key.split('/').some(part => !part || part === '.' || part === '..')
    ) {
      Taon.error({
        status: getStatusCode(HttpStatusEnum.BAD_REQUEST),
        message: `Invalid bucket object key "${String(key)}".`,
      });
    }
    //#endregion
  }
  //#endregion

  //#region methods / raw sql / with query runner
  private async withQueryRunner<T>(
    context: EndpointContext,
    action: (queryRunner: QueryRunner) => Promise<T>,
  ): Promise<T> {
    //#region @websqlFunc
    if (!context.connection) {
      Taon.error({
        status: getStatusCode(HttpStatusEnum.BAD_REQUEST),
        message: `Context "${context.contextName}" does not have an initialized SQL connection.`,
      });
    }
    const queryRunner = context.connection.createQueryRunner();
    try {
      await queryRunner.connect();
      return await action(queryRunner);
    } finally {
      await queryRunner.release();
    }
    //#endregion
  }
  //#endregion

  //#region methods / raw sql / is sqlite family
  private isSqliteFamily(queryRunner: QueryRunner): boolean {
    //#region @websqlFunc
    return SQLITE_FAMILY_DRIVERS.includes(
      String(queryRunner.connection.driver.options.type),
    );
    //#endregion
  }
  //#endregion

  //#region methods / raw sql / is internal table
  private isInternalTable(tableName: string): boolean {
    //#region @websqlFunc
    return (
      /^sqlite_/i.test(tableName) ||
      /^_cf_/i.test(tableName) ||
      tableName === 'd1_migrations'
    );
    //#endregion
  }
  //#endregion

  //#region methods / raw sql / load raw tables
  private async loadRawTables(
    queryRunner: QueryRunner,
    tableName?: string,
  ): Promise<Table[]> {
    //#region @websqlFunc
    if (this.isSqliteFamily(queryRunner)) {
      // Pre-filter internal tables: D1 forbids introspection of _cf_* tables.
      const result: { name: string }[] = await queryRunner.query(
        `SELECT name FROM sqlite_master WHERE type = 'table'`,
      );
      const names = result
        .map(item => String(item.name))
        .filter(name => !this.isInternalTable(name))
        .filter(name => tableName === undefined || name === tableName);
      return names.length ? queryRunner.getTables(names) : [];
    }
    const tables = await queryRunner.getTables();
    return tables.filter(
      table =>
        !this.isInternalTable(table.name) &&
        (tableName === undefined || table.name === tableName),
    );
    //#endregion
  }
  //#endregion

  //#region methods / raw sql / require raw table
  private async requireRawTable(
    queryRunner: QueryRunner,
    tableName: string,
  ): Promise<Table> {
    //#region @websqlFunc
    const table =
      typeof tableName === 'string' && tableName
        ? (await this.loadRawTables(queryRunner, tableName))[0]
        : undefined;
    if (!table) {
      Taon.error({
        status: getStatusCode(HttpStatusEnum.NOT_FOUND),
        message: `SQL table "${String(tableName)}" was not found.`,
      });
    }
    return table!;
    //#endregion
  }
  //#endregion

  //#region methods / raw sql / to sql table
  private toSqlTable(table: Table): TaonSudoModels.SqlTable {
    //#region @websqlFunc
    const primaryColumns = table.primaryColumns.map(column => column.name);
    return {
      name: table.name,
      tableName: table.name,
      raw: true,
      columns: table.columns.map(column => ({
        name: column.name,
        propertyName: column.name,
        type: String(column.type || 'text'),
        primary: column.isPrimary,
        generated: column.isGenerated,
        nullable: column.isNullable,
      })),
      primaryColumns,
      ...(primaryColumns.length
        ? {}
        : {
            rowOperationsDisabledReason:
              'This table has no primary key, so a single row cannot be identified safely. Edit and delete are disabled.',
          }),
    };
    //#endregion
  }
  //#endregion

  //#region methods / raw sql / escape table name
  private escapeTableName(queryRunner: QueryRunner, tableName: string): string {
    //#region @websqlFunc
    const driver = queryRunner.connection.driver;
    if (this.isSqliteFamily(queryRunner)) {
      return driver.escape(tableName);
    }
    // schema-qualified names (e.g. postgres "schema.table")
    return tableName
      .split('.')
      .map(part => driver.escape(part))
      .join('.');
    //#endregion
  }
  //#endregion

  //#region methods / raw sql / parameter
  private parameter(queryRunner: QueryRunner, index: number): string {
    //#region @websqlFunc
    return queryRunner.connection.driver.createParameter(
      `${RAW_SQL_PARAM_PREFIX}${index}`,
      index,
    );
    //#endregion
  }
  //#endregion

  //#region methods / raw sql / read count
  private readCount(result: unknown): number {
    //#region @websqlFunc
    const row = Array.isArray(result) ? result[0] : undefined;
    if (!row || typeof row !== 'object') {
      return 0;
    }
    const value =
      (row as Record<string, unknown>)['count'] ??
      Object.values(row as Record<string, unknown>)[0];
    return Number(value || 0);
    //#endregion
  }
  //#endregion

  //#region methods / raw sql / assert row object
  private assertRowObject(row: unknown): void {
    //#region @websqlFunc
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      Taon.error({
        status: getStatusCode(HttpStatusEnum.BAD_REQUEST),
        message: 'A row object is required.',
      });
    }
    //#endregion
  }
  //#endregion

  //#region methods / raw sql / assert nullable
  private assertNullable(column: TableColumn, value: unknown): void {
    //#region @websqlFunc
    if (value === null && !column.isNullable) {
      Taon.error({
        status: getStatusCode(HttpStatusEnum.BAD_REQUEST),
        message: `Column "${column.name}" cannot be empty (NULL).`,
      });
    }
    //#endregion
  }
  //#endregion

  //#region methods / raw sql / to sql value
  private toSqlValue(
    queryRunner: QueryRunner,
    column: TableColumn,
    value: unknown,
  ): unknown {
    //#region @websqlFunc
    if (value === undefined || value === null) {
      return null;
    }
    const type = String(column.type || '').toLowerCase();
    const isNumeric =
      /^(tiny|small|medium|big)?int(eger)?\b|^(int[248]|serial|bigserial|smallserial)$|float|double|real|decimal|numeric|^number$/.test(
        type,
      );
    if (isNumeric) {
      if (value === '') {
        return null;
      }
      if (typeof value === 'boolean') {
        return value ? 1 : 0;
      }
      const numberValue = Number(value);
      if (!Number.isFinite(numberValue)) {
        Taon.error({
          status: getStatusCode(HttpStatusEnum.BAD_REQUEST),
          message: `Column "${column.name}" expects a number.`,
        });
      }
      return numberValue;
    }
    if (typeof value === 'boolean') {
      return this.isSqliteFamily(queryRunner) ? (value ? 1 : 0) : value;
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return value;
    //#endregion
  }
  //#endregion

  //#region methods / raw sql / build primary key where
  private buildPrimaryKeyWhere(
    queryRunner: QueryRunner,
    table: Table,
    primaryKey: Record<string, unknown>,
    params: unknown[],
  ): string {
    //#region @websqlFunc
    const primaryColumns = table.primaryColumns;
    if (!primaryColumns.length) {
      Taon.error({
        status: getStatusCode(HttpStatusEnum.BAD_REQUEST),
        message: `SQL table "${table.name}" has no primary key; row operations are disabled to avoid modifying multiple rows.`,
      });
    }
    if (
      !primaryKey ||
      typeof primaryKey !== 'object' ||
      primaryColumns.some(
        column =>
          !Object.prototype.hasOwnProperty.call(primaryKey, column.name) ||
          primaryKey[column.name] === null ||
          primaryKey[column.name] === undefined,
      )
    ) {
      Taon.error({
        status: getStatusCode(HttpStatusEnum.BAD_REQUEST),
        message: 'A complete primary key is required for this row operation.',
      });
    }
    const driver = queryRunner.connection.driver;
    return primaryColumns
      .map(column => {
        params.push(
          this.toSqlValue(queryRunner, column, primaryKey[column.name]),
        );
        return `${driver.escape(column.name)} = ${this.parameter(queryRunner, params.length - 1)}`;
      })
      .join(' AND ');
    //#endregion
  }
  //#endregion

  //#region methods / raw sql / assert single row
  private async assertSingleRow(
    queryRunner: QueryRunner,
    table: Table,
    primaryKey: Record<string, unknown>,
  ): Promise<void> {
    //#region @websqlFunc
    const params: unknown[] = [];
    const where = this.buildPrimaryKeyWhere(
      queryRunner,
      table,
      primaryKey,
      params,
    );
    const count = this.readCount(
      await queryRunner.query(
        `SELECT COUNT(*) AS count FROM ${this.escapeTableName(queryRunner, table.name)} WHERE ${where}`,
        params,
      ),
    );
    if (count === 0) {
      Taon.error({
        status: getStatusCode(HttpStatusEnum.NOT_FOUND),
        message: 'The selected row no longer exists.',
      });
    }
    if (count > 1) {
      Taon.error({
        status: getStatusCode(HttpStatusEnum.CONFLICT),
        message: `The primary key matches ${count} rows; the operation was cancelled.`,
      });
    }
    //#endregion
  }
  //#endregion
}
