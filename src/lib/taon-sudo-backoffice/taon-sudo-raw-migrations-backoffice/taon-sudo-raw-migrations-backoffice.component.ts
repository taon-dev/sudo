//#region imports
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterOutlet } from '@angular/router';
import { Translation } from '@taon-dev/i18n/src';
import { Taon } from 'taon/src';

import {
  TaonSudoRawMigrationJob,
  TaonSudoRawMigrationSummary,
} from '../../taon-sudo/taon-sudo-raw-migration.models';

import { TaonSudoRawMigrationsBackofficeApiService } from './taon-sudo-raw-migrations-backoffice.api.service';
//#endregion

const t = Translation.for(Taon.__FILE_RELATIVE_PATH, Taon.LANG_IMPORT_MAP);

@Component({
  selector: 'app-taon-sudo-raw-migrations-backoffice',
  templateUrl: './taon-sudo-raw-migrations-backoffice.component.html',
  styleUrls: ['./taon-sudo-raw-migrations-backoffice.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterOutlet,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  providers: [TaonSudoRawMigrationsBackofficeApiService],
})
export class TaonSudoRawMigrationsBackofficeComponent
  implements OnInit, OnDestroy
{
  t = t.for(this);

  private readonly api = inject(TaonSudoRawMigrationsBackofficeApiService);

  readonly contexts = signal<string[]>([]);

  readonly selectedContext = signal('');

  readonly snapshots = signal<TaonSudoRawMigrationSummary[]>([]);

  readonly activeJob = signal<TaonSudoRawMigrationJob | null>(null);

  readonly busy = signal(false);

  readonly clearAllData = signal(false);

  readonly activeTab = signal<'snapshot' | 'restore'>('snapshot');

  readonly createDialogOpen = signal(false);

  readonly createContext = signal('');

  readonly snapshotName = signal('');

  readonly errorMessage = signal('');

  readonly statusMessage = signal('');

  private destroyed = false;

  //#region methods / ng on init
  ngOnInit(): void {
    void this.loadContexts();
  }
  //#endregion

  //#region methods / ng on destroy
  ngOnDestroy(): void {
    this.destroyed = true;
  }
  //#endregion

  //#region methods / load contexts
  async loadContexts(): Promise<void> {
    this.busy.set(true);
    this.errorMessage.set('');
    try {
      const contexts = await this.api.getContexts();
      this.contexts.set(contexts);
      const context = this.selectedContext() || contexts[0] || '';
      this.selectedContext.set(context);
      if (context) {
        await this.loadSnapshots();
      }
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy.set(false);
    }
  }
  //#endregion

  //#region methods / select context
  async selectContext(event: Event): Promise<void> {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }
    this.selectedContext.set(target.value);
    await this.loadSnapshots();
  }
  //#endregion

  //#region methods / set clear all data
  setClearAllData(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.clearAllData.set(target.checked);
    }
  }
  //#endregion

  //#region methods / load snapshots
  async loadSnapshots(): Promise<void> {
    const context = this.selectedContext();
    if (!context) {
      this.snapshots.set([]);
      return;
    }
    this.errorMessage.set('');
    try {
      this.snapshots.set(await this.api.getSnapshots(context));
    } catch (error) {
      this.showError(error);
    }
  }
  //#endregion

  //#region methods / select tab
  selectTab(tab: 'snapshot' | 'restore'): void {
    this.activeTab.set(tab);
  }
  //#endregion

  //#region methods / open create dialog
  openCreateDialog(): void {
    this.createContext.set(this.selectedContext());
    this.snapshotName.set('');
    this.createDialogOpen.set(true);
  }
  //#endregion

  //#region methods / close create dialog
  closeCreateDialog(): void {
    this.createDialogOpen.set(false);
  }
  //#endregion

  //#region methods / set snapshot name
  setSnapshotName(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.snapshotName.set(target.value);
    }
  }
  //#endregion

  //#region methods / set create context
  setCreateContext(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLSelectElement) {
      this.createContext.set(target.value);
    }
  }
  //#endregion

  //#region methods / create snapshot
  async createSnapshot(event: Event): Promise<void> {
    event.preventDefault();
    const context = this.createContext();
    const name = this.snapshotName().trim();
    if (!context || !name) {
      return;
    }
    this.selectedContext.set(context);
    this.createDialogOpen.set(false);
    await this.runRequest(
      this.t.gettext('Creating raw migration snapshot'),
      async () => {
        const job = await this.api.createSnapshot(context, name);
        await this.followJob(job);
      },
    );
  }
  //#endregion

  //#region methods / on escpae
  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeCreateDialog();
  }
  //#endregion

  //#region methods / stop snapshot
  async stopSnapshot(): Promise<void> {
    const job = this.activeJob();
    if (!job || job.operation !== 'create' || job.status !== 'running') {
      return;
    }
    try {
      const stopped = await this.api.stopJob(job.id);
      this.statusMessage.set(
        stopped
          ? this.t.gettext(
              'Stop requested; the current safe operation will finish first.',
            )
          : this.t.gettext('This operation cannot be stopped at this stage.'),
      );
    } catch (error) {
      this.showError(error);
    }
  }
  //#endregion

  //#region methods / restore snapshot
  async restoreSnapshot(snapshot: TaonSudoRawMigrationSummary): Promise<void> {
    const context = this.selectedContext();
    const clearAllData = this.clearAllData();
    const confirmation = clearAllData
      ? this.t.gettext(
          'Clear all eligible SQL rows and bucket objects, then restore this snapshot? KV data and excluded TaonSudo assets will not be changed.',
        )
      : this.t.gettext(
          'Overlay this snapshot? Matching SQL records will be replaced and snapshot bucket keys overwritten. Other data will be kept.',
        );
    if (!context || !globalThis.confirm(confirmation)) {
      return;
    }
    await this.runRequest(
      this.t.gettext('Restoring raw migration snapshot'),
      async () => {
        const job = await this.api.restoreSnapshot(
          context,
          snapshot.id,
          clearAllData,
        );
        await this.followJob(job);
      },
    );
  }
  //#endregion

  //#region methods / delete snapshot
  async deleteSnapshot(snapshot: TaonSudoRawMigrationSummary): Promise<void> {
    const context = this.selectedContext();
    if (
      !context ||
      !globalThis.confirm(
        this.t.gettext('Permanently delete this raw migration snapshot?'),
      )
    ) {
      return;
    }
    await this.runRequest(
      this.t.gettext('Deleting raw migration snapshot'),
      async () => {
        await this.api.deleteSnapshot(context, snapshot.id);
        this.statusMessage.set(this.t.gettext('Snapshot deleted.'));
        await this.loadSnapshots();
      },
    );
  }
  //#endregion

  //#region methods / import snapshot
  async importSnapshot(event: Event): Promise<void> {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    const file = target.files?.[0];
    target.value = '';
    const context = this.selectedContext();
    if (!file || !context) {
      return;
    }
    const defaultName = file.name.replace(/\.zip$/i, '').trim();
    const name = globalThis.prompt(
      this.t.gettext('Name for imported snapshot'),
      defaultName,
    );
    if (!name?.trim()) {
      return;
    }
    await this.runRequest(
      this.t.gettext('Importing raw migration ZIP'),
      async () => {
        const snapshot = await this.api.importSnapshot(context, file, name);
        this.statusMessage.set(
          this.t.gettext('Snapshot imported: ') + snapshot.name,
        );
        await this.loadSnapshots();
      },
    );
  }
  //#endregion

  //#region methods / export url
  exportUrl(snapshot: TaonSudoRawMigrationSummary): string {
    return this.api.exportUrl(this.selectedContext(), snapshot.id);
  }
  //#endregion

  //#region methods / format bytes
  formatBytes(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    const units = ['KB', 'MB', 'GB', 'TB'];
    let size = bytes / 1024;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit++;
    }
    return `${size.toFixed(1)} ${units[unit]}`;
  }
  //#endregion

  //#region methods / run request
  private async runRequest(
    message: string,
    action: () => Promise<void>,
  ): Promise<void> {
    this.busy.set(true);
    this.errorMessage.set('');
    this.statusMessage.set(message);
    try {
      await action();
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy.set(false);
      this.activeJob.set(null);
    }
  }
  //#endregion

  //#region methods / follow job
  private async followJob(job: TaonSudoRawMigrationJob): Promise<void> {
    this.activeJob.set(job);
    while (job.status === 'running' && !this.destroyed) {
      await new Promise(resolve => setTimeout(resolve, 900));
      job = await this.api.getJob(job.id);
      this.activeJob.set(job);
    }
    if (job.status === 'failed') {
      throw new Error(job.error || this.t.gettext('Raw migration failed.'));
    }
    if (job.status === 'cancelled') {
      this.statusMessage.set(this.t.gettext('Snapshot creation was stopped.'));
    } else {
      this.statusMessage.set(
        job.operation === 'create'
          ? this.t.gettext('Snapshot created: ') + job.snapshotId
          : this.t.gettext('Snapshot restored.'),
      );
    }
    await this.loadSnapshots();
  }
  //#endregion

  //#region methods / show error
  private showError(error: unknown): void {
    this.errorMessage.set(
      error instanceof Error
        ? error.message
        : this.t.gettext('Raw migration operation failed.'),
    );
    this.statusMessage.set('');
  }
  //#endregion
}
