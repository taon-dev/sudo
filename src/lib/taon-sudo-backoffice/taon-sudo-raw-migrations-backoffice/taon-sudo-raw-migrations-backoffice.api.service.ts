//#region imports
import { Injectable } from '@angular/core';
import { TaonBaseAngularService } from 'taon/src';

import {
  TaonSudoRawMigrationJob,
  TaonSudoRawMigrationSummary,
} from '../../taon-sudo/taon-sudo-raw-migration.models';
import { TaonSudoRawMigrationController } from '../../taon-sudo/taon-sudo-raw-migration.controller';
//#endregion

@Injectable()
export class TaonSudoRawMigrationsBackofficeApiService extends TaonBaseAngularService {
  private readonly controller = this.injectController(
    TaonSudoRawMigrationController,
  );

  getContexts(): Promise<string[]> {
    return this.json(this.controller.getRawMigrationContexts());
  }

  getSnapshots(contextName: string): Promise<TaonSudoRawMigrationSummary[]> {
    return this.json(this.controller.getRawMigrationSnapshots(contextName));
  }

  createSnapshot(
    contextName: string,
    name: string,
  ): Promise<TaonSudoRawMigrationJob> {
    return this.json(
      this.controller.createRawMigrationSnapshot(contextName, name),
    );
  }

  getJob(jobId: string): Promise<TaonSudoRawMigrationJob> {
    return this.json(this.controller.getRawMigrationJob(jobId));
  }

  stopJob(jobId: string): Promise<boolean> {
    return this.json(this.controller.stopRawMigrationJob(jobId));
  }

  restoreSnapshot(
    contextName: string,
    snapshotId: string,
    clearAllData = false,
  ): Promise<TaonSudoRawMigrationJob> {
    return this.json(
      this.controller.restoreRawMigrationSnapshot(
        contextName,
        snapshotId,
        clearAllData,
      ),
    );
  }

  deleteSnapshot(contextName: string, snapshotId: string): Promise<boolean> {
    return this.json(
      this.controller.deleteRawMigrationSnapshot(contextName, snapshotId),
    );
  }

  importSnapshot(
    contextName: string,
    file: File,
    name: string,
  ): Promise<TaonSudoRawMigrationSummary> {
    const formData = new FormData();
    formData.append('file', file);
    return this.json(
      this.controller.importRawMigrationSnapshot(contextName, name, formData),
    );
  }

  exportUrl(contextName: string, snapshotId: string): string {
    const url = new URL(
      this.controller.getThisControllerMethodFullUrl(
        'exportRawMigrationSnapshot',
      ),
      globalThis.location.href,
    );
    url.searchParams.set('contextName', contextName);
    url.searchParams.set('snapshotId', snapshotId);
    return url.href;
  }

  private async json<T>(action: {
    request?: () => Promise<{ body: { json: T } }>;
  }): Promise<T> {
    if (!action.request) {
      throw new Error('The Taon raw migration request is unavailable.');
    }
    const response = await action.request();
    return response.body.json;
  }
}
