//#region imports
import { createContext, TaonBaseContext } from 'taon/src';

import { TaonSudoController } from './taon-sudo.controller';
import { TaonSudoKvRepository } from './taon-sudo.kv.repository';
import { TaonSudoProvider } from './taon-sudo.provider';
import { TaonSudoRawMigrationController } from './taon-sudo-raw-migration.controller';
import { TaonSudoRawMigrationRepository } from './taon-sudo-raw-migration.repository';
import { TaonSudoRepository } from './taon-sudo.repository';
import { TaonSudoSnapshotEntity } from './taon-sudo-snapshot.entity';
//#endregion

export const TaonSudoAbstractContext = createContext(() => ({
  contextName: 'TaonSudoAbstractContext',
  abstract: true,
  contexts: { TaonBaseContext },
  entities: { TaonSudoSnapshotEntity },
  controllers: {
    TaonSudoController,
    TaonSudoRawMigrationController,
  },
  repositories: {
    TaonSudoKvRepository,
    TaonSudoRawMigrationRepository,
    TaonSudoRepository,
  },
  providers: { TaonSudoProvider },
}));
