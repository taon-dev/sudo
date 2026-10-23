//#region imports
import {
  TaonBaseRepository,
  TaonBaseKvRepository,
  TaonRepository,
} from 'taon/src';

import { TaonSudoKvRepositoryName } from './taon-sudo.constants';

//#endregion

@TaonRepository({
  className: TaonSudoKvRepositoryName,
})
export class TaonSudoKvRepository extends TaonBaseKvRepository<{}> {}
