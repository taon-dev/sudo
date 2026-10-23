//#region imports
import {
  CustomColumn,
  Column,
  Taon,
  TaonBaseAbstractEntity,
  TaonEntity,
} from 'taon/src';
import { _ } from 'tnp-core/src';

// import { TaonSudoSnapshootDefaultsValues } from './taon-sudo-snapshoot.constants';
//#endregion

@TaonEntity<TaonSudoSnapshootEntity>({
  className: 'TaonSudoSnapshootEntity',
  createTable: true,
  // defaultModelMapping: () => ({
  //   nestedObjectField: ClassField,
  //   nestedArrField: [ClassObjArrField],
  // }),
})
export class TaonSudoSnapshootEntity extends TaonBaseAbstractEntity<TaonSudoSnapshootEntity> {
  //#region @websql
  @CustomColumn({
    type: 'varchar',
    length: 100,
    // default: TaonSudoSnapshootDefaultsValues.description,
  })
  //#endregion
  description?: string;
}
