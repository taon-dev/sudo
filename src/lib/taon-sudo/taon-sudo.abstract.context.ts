//#region imports
import { createContext, TaonBaseContext } from 'taon/src';

import { TaonSudoController } from './taon-sudo.controller';
import { TaonSudoKvRepository } from './taon-sudo.kv.repository';
import { TaonSudoProvider } from './taon-sudo.provider';
import { TaonSudoRepository } from './taon-sudo.repository';
//#endregion

export const TaonSudoAbstractContext = createContext(() => ({
  contextName: 'TaonSudoAbstractContext',
  abstract: true,
  contexts: { TaonBaseContext },
  controllers: { TaonSudoController },
  repositories: {
    TaonSudoKvRepository,
    TaonSudoRepository,
  },
  providers: { TaonSudoProvider },
}));
