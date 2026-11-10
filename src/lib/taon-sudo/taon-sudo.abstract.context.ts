//#region imports
import { createContext, TaonBaseContext } from 'taon/src';

import { TaonSudoRawMigrationController } from './taon-sudo-raw-migration.controller';
import { TaonSudoRawMigrationRepository } from './taon-sudo-raw-migration.repository';
import { TaonSudoSnapshotEntity } from './taon-sudo-snapshot.entity';
import { TaonSudoUploadStorageController } from './taon-sudo-upload-storage.controller';
import { TaonSudoController } from './taon-sudo.controller';
import { TaonSudoKvRepository } from './taon-sudo.kv.repository';
import { TaonSudoProvider } from './taon-sudo.provider';
import { TaonSudoRepository } from './taon-sudo.repository';
//#endregion

export const TaonSudoAbstractContext = createContext(() => ({
  contextName: 'TaonSudoAbstractContext',
  abstract: true,
  contexts: { TaonBaseContext },
  entities: { TaonSudoSnapshotEntity },
  controllers: {
    TaonSudoController,
    TaonSudoRawMigrationController,
    TaonSudoUploadStorageController,
  },
  repositories: {
    TaonSudoKvRepository,
    TaonSudoRawMigrationRepository,
    TaonSudoRepository,
  },
  providers: { TaonSudoProvider },
}));
