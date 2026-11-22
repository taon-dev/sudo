import {
  TaonSudoRawMigrationColumnValueMapping,
  TaonSudoRawMigrationColumnValueStrategy,
} from './taon-sudo-raw-migration.models';

export function hasColumnValueStrategy(
  mapping: TaonSudoRawMigrationColumnValueMapping,
): mapping is Extract<
  TaonSudoRawMigrationColumnValueMapping,
  { strategy: TaonSudoRawMigrationColumnValueStrategy }
> {
  //#region @websqlFunc
  return Boolean(mapping.strategy);
  //#endregion
}
