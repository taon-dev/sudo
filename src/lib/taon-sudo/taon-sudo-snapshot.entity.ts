//#region imports
import {
  CustomColumn,
  DateTimeColumn,
  StringColumn,
  TaonBaseAbstractEntity,
  TaonEntity,
} from 'taon/src';
//#endregion

@TaonEntity<TaonSudoSnapshotEntity>({
  className: 'TaonSudoSnapshotEntity',
  createTable: true,
})
export class TaonSudoSnapshotEntity extends TaonBaseAbstractEntity<TaonSudoSnapshotEntity> {
  //#region @websql
  @StringColumn()
  //#endregion
  snapshotId: string;

  //#region @websql
  @StringColumn()
  //#endregion
  contextName: string;

  //#region @websql
  @StringColumn()
  //#endregion
  name: string;

  //#region @websql
  @DateTimeColumn()
  //#endregion
  createdAt: string;

  //#region @websql
  @CustomColumn({
    type: 'integer',
  })
  //#endregion
  totalBytes: number;

  //#region @websql
  @CustomColumn({
    type: 'integer',
  })
  //#endregion
  totalFiles: number;
}
