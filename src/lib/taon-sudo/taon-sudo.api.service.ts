//#region imports
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { Taon, TaonBaseAngularService, TaonStorageObject } from 'taon/src';

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
}

@Injectable()
export class TaonSudoApiService extends TaonBaseAngularService {
  private readonly taonSudoController =
    this.injectController(TaonSudoController);

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
