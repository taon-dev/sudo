import { TaonSessionEntityClassName } from '@taon-dev/session/src';

import { TaonSudoModels } from './taon-sudo.models';

export namespace TaonSudoUtils {
  //#region is raw migration sql entity included
  export function isRawMigrationSqlEntityIncluded(
    entityName: string,
    tableName = entityName,
  ): boolean {
    return (
      !entityName.startsWith('TaonSudo') &&
      !tableName.startsWith('TaonSudo') &&
      entityName !== TaonSessionEntityClassName &&
      tableName !== TaonSessionEntityClassName &&
      entityName !== 'TAON_MIGRATION_META' &&
      tableName !== 'TAON_MIGRATION_META'
    );
  }
  //#endregion

  //#region is raw migration bucket controller included
  export function isRawMigrationBucketControllerIncluded(
    controllerName: string,
  ): boolean {
    return !controllerName.startsWith('TaonSudo');
  }
  //#endregion
}
