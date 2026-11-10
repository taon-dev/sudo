//#region imports
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { Taon, TaonBaseAngularService, TaonStorageObject } from 'taon/src';

import { TaonSudoUploadStorageController } from './taon-sudo-upload-storage.controller';
import { TaonSudoController } from './taon-sudo.controller';
import { TaonSudoModels } from './taon-sudo.models';
//#endregion

export interface TaonSudoSqlColumn {
  name: string;
  propertyName: string;
  type: string;
  primary: boolean;
  generated: boolean;
  nullable: boolean;
}

export interface TaonSudoSqlEntity {
  name: string;
  tableName: string;
  columns: TaonSudoSqlColumn[];
  primaryColumns: string[];
  raw?: boolean;
  rowOperationsDisabledReason?: string;
  sensitive?: boolean;
}

@Injectable()
export class TaonSudoApiService extends TaonBaseAngularService {
  private readonly taonSudoController =
    this.injectController(TaonSudoController);

  private readonly uploadController = this.injectController(
    TaonSudoUploadStorageController,
  );

  public get crudController(): TaonSudoController {
    return this.taonSudoController;
  }

  //#region methods / get contexts
  getContexts(): Promise<string[]> {
    return this.taonSudoController
      .getContexts()
      .request()
      .then(response => response.body.json);
  }
  //#endregion

  //#region methods / get sql contexts
  getSqlContexts(): Promise<string[]> {
    return this.taonSudoController
      .getSqlContexts()
      .request()
      .then(response => response.body.json);
  }
  //#endregion

  //#region methods / get sql entities
  getSqlEntities(contextName: string): Promise<TaonSudoSqlEntity[]> {
    return this.taonSudoController
      .getSqlEntities(contextName)
      .request()
      .then(response => response.body.json);
  }
  //#endregion

  //#region methods / get sql rows
  getSqlRows(
    contextName: string,
    entityName: string,
    page: number,
    pageSize: number,
  ): Promise<{
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
    return this.taonSudoController
      .getSqlRows(contextName, entityName, page, pageSize)
      .request()
      .then(response => response.body.json);
  }
  //#endregion

  //#region methods / add sql row
  addSqlRow(
    contextName: string,
    entityName: string,
    row: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.taonSudoController
      .addSqlRow(contextName, entityName, row)
      .request()
      .then(response => response.body.json);
  }
  //#endregion

  //#region methods / edit sql row
  editSqlRow(
    contextName: string,
    entityName: string,
    primaryKey: Record<string, unknown>,
    row: Record<string, unknown>,
  ): Promise<boolean> {
    return this.taonSudoController
      .editSqlRow(contextName, entityName, primaryKey, row)
      .request()
      .then(response => response.body.json);
  }
  //#endregion

  //#region methods / delete sql row
  deleteSqlRow(
    contextName: string,
    entityName: string,
    primaryKey: Record<string, unknown>,
  ): Promise<boolean> {
    return this.taonSudoController
      .deleteSqlRow(contextName, entityName, primaryKey)
      .request()
      .then(response => response.body.json);
  }
  //#endregion

  //#region methods / clear sql table
  clearSqlTable(contextName: string, entityName: string): Promise<number> {
    return this.taonSudoController
      .clearSqlTable(contextName, entityName)
      .request()
      .then(response => response.body.json);
  }
  //#endregion

  //#region methods / get kv repositories
  getKvRepositories(contextName: string): Promise<string[]> {
    return this.taonSudoController
      .getKvRepositories(contextName)
      .request()
      .then(response => response.body.json);
  }
  //#endregion

  //#region methods / get kv data
  getKvData(
    contextName: string,
    repositoryName: string,
  ): Promise<{ key: string; value: unknown }[]> {
    return this.taonSudoController
      .getKvData(contextName, repositoryName)
      .request()
      .then(response => response.body.json);
  }
  //#endregion

  //#region methods / set kv value
  setKvValue(
    contextName: string,
    repositoryName: string,
    key: string,
    value: unknown,
  ): Promise<boolean> {
    return this.taonSudoController
      .setKvValue(contextName, repositoryName, key, value)
      .request()
      .then(response => response.body.json);
  }
  //#endregion

  //#region methods / delete kv value
  deleteKvValue(
    contextName: string,
    repositoryName: string,
    key: string,
  ): Promise<boolean> {
    return this.taonSudoController
      .deleteKvValue(contextName, repositoryName, key)
      .request()
      .then(response => response.body.json);
  }
  //#endregion

  //#region methods / clear kv batch
  clearKvBatch(
    contextName: string,
    repositoryName: string,
    cursor?: string,
  ): Promise<TaonSudoModels.ClearBatchResult> {
    return this.taonSudoController
      .clearKvBatch(contextName, repositoryName, cursor)
      .request()
      .then(response => response.body.json);
  }
  //#endregion

  //#region methods / get storage controllers
  getStorageControllers(contextName: string): Promise<string[]> {
    return this.taonSudoController
      .getStorageControllers(contextName)
      .request()
      .then(response => response.body.json);
  }
  //#endregion

  //#region methods / get bucket files
  getBucketFiles(
    contextName: string,
    controllerName: string,
  ): Promise<TaonStorageObject[]> {
    return this.taonSudoController
      .getBucketFiles(contextName, controllerName)
      .request()
      .then(response => response.body.json);
  }
  //#endregion

  //#region methods / get bucket files
  getAllContextsData(): Observable<TaonSudoModels.BasicContextData[]> {
    return this.taonSudoController
      .getAllContextsData()
      .request()
      .observable.pipe(map(c => c.body.json));
  }
  //#endregion

  //#region methods / delete bucket file
  deleteBucketFile(
    contextName: string,
    controllerName: string,
    key: string,
  ): Promise<boolean> {
    return this.taonSudoController
      .deleteBucketFile(contextName, controllerName, key)
      .request()
      .then(response => response.body.json);
  }
  //#endregion

  //#region methods / upload bucket file
  uploadBucketFile(
    contextName: string,
    controllerName: string,
    file: File,
  ): Promise<TaonStorageObject[]> {
    const formData = new FormData();
    formData.append('file', file);
    return this.taonSudoController
      .uploadBucketFile(contextName, controllerName, formData)
      .request()
      .then(response => response.body.json);
  }
  //#endregion

  //#region methods / clear bucket batch
  clearBucketBatch(
    contextName: string,
    controllerName: string,
  ): Promise<TaonSudoModels.ClearBatchResult> {
    return this.taonSudoController
      .clearBucketBatch(contextName, controllerName)
      .request()
      .then(response => response.body.json);
  }
  //#endregion

  //#region methods / upload bucket file multipart
  /**
   * Uploads the file with Taon multipart upload (chunks, cancellable) and
   * stores it in the target bucket.
   * - replace === false: creates a new asset (existing key is rejected)
   * - replace === true: overwrites the existing asset with the given key
   */
  async uploadBucketFileMultipart(
    contextName: string,
    controllerName: string,
    file: File,
    options: {
      targetKey?: string;
      replace?: boolean;
      signal?: AbortSignal;
      onProgress?: (percentage: number) => void;
      onUploaded?: () => void;
    } = {},
  ): Promise<TaonStorageObject | undefined> {
    const [uploaded] = await this.uploadController.uploadFileInChunks(file, {
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      signal: options.signal,
      onProgress: options.onProgress,
    });
    if (!uploaded?.key) {
      throw new Error('The upload did not complete.');
    }
    options.onUploaded?.();
    return this.taonSudoController
      .transferUploadedBucketFile(
        contextName,
        controllerName,
        uploaded.key,
        options.targetKey || '',
        !!options.replace,
      )
      .request()
      .then(response => response.body.json);
  }
  //#endregion

  //#region methods / fetch bucket file text preview
  /**
   * Fetches only the beginning of a text file (HTTP Range) for preview.
   */
  async fetchBucketFileTextPreview(
    contextName: string,
    controllerName: string,
    key: string,
    maxBytes = 64 * 1024,
  ): Promise<{ text: string; truncated: boolean }> {
    const response = await fetch(
      this.getBucketFileUrl(contextName, controllerName, key),
      {
        credentials: 'include',
        headers: { Range: `bytes=0-${maxBytes - 1}` },
      },
    );
    if (!response.ok) {
      throw new Error(`Preview request failed (${response.status}).`);
    }
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer).slice(0, maxBytes);
    const totalFromRange = Number(
      response.headers.get('content-range')?.split('/')[1],
    );
    const truncated =
      buffer.byteLength > maxBytes ||
      (Number.isFinite(totalFromRange) && totalFromRange > bytes.byteLength);
    return {
      text: new TextDecoder('utf-8', { fatal: false }).decode(bytes),
      truncated,
    };
  }
  //#endregion

  //#region methods / get bucket file url
  getBucketFileUrl(
    contextName: string,
    controllerName: string,
    key: string,
    download = false,
  ): string {
    const url = new URL(
      this.taonSudoController.getThisControllerMethodFullUrl(
        'downloadBucketFile',
      ),
      globalThis.location.href,
    );
    url.searchParams.set('contextName', contextName);
    url.searchParams.set('controllerName', controllerName);
    url.searchParams.set('key', key);
    url.searchParams.set('download', String(download));
    return url.href;
  }
  //#endregion
}
