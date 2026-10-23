import { TaonSudoModels } from './taon-sudo.models';

export namespace TaonSudoUtils {
  export function exampleUtil(
    state: string,
  ): state is TaonSudoModels.ExmapleTaonSudoState {
    return state === 'active';
  }
}
