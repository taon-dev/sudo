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

  //#region format bytes
  /**
   * Human readable size, e.g. 123 B, 12 KB, 100 MB, 1.4 GB (1024 based).
   */
  export function formatBytes(bytes: number | undefined | null): string {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value < 0) {
      return '-';
    }
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = value;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    const precision = unitIndex === 0 || size >= 10 ? 0 : 1;
    const formatted = size.toFixed(precision).replace(/\.0$/, '');
    return `${formatted} ${units[unitIndex]}`;
  }
  //#endregion
}
