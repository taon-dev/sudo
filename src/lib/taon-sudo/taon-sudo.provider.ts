//#region imports
import { Taon, TaonBaseClass, TaonBaseProvider, TaonProvider } from 'taon/src';
import { _ } from 'tnp-core/src';
//#endregion

export class TaonTaonSudoConfig extends TaonBaseClass {
  declare name: string;
}

@TaonProvider({
  className: 'TaonSudoProvider',
})
export class TaonSudoProvider extends TaonBaseProvider {

  config = new TaonTaonSudoConfig();

  clone() {
    return {
      config: this.config.clone(),
    };
  }
}
