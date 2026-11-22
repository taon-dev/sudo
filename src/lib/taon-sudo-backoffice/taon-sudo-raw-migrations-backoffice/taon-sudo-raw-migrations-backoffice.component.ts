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
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { RouterOutlet } from '@angular/router';
import { Translation } from '@taon-dev/i18n/src';
import {
  TaonSessionApiService,
  TaonSessionConfigService,
  TaonSessionState,
  TaonSessionStateService,
} from '@taon-dev/session/src';
import { firstValueFrom } from 'rxjs';
import { filter, take, tap, timeout } from 'rxjs/operators';
import { Taon } from 'taon/src';

import {
  TaonSudoRawMigrationJob,
  TaonSudoRawMigrationRestorePlan,
  TaonSudoRawMigrationSummary,
} from '../../taon-sudo/taon-sudo-raw-migration.models';

import { TaonSudoRawMigrationsBackofficeApiService } from './taon-sudo-raw-migrations-backoffice.api.service';
import {
  TaonSudoRawMigrationRestoreEditorComponent,
  TaonSudoRawMigrationRestoreEditorData,
} from './taon-sudo-raw-migration-restore-editor.component';
//#endregion

const t = Translation.for(Taon.__FILE_RELATIVE_PATH, Taon.LANG_IMPORT_MAP);

interface PendingRawMigrationRestoreAcknowledgement {
  version: 1;
  type: 'raw-migration-restore-success';
  snapshotId: string;
  contextName: string;
  createdAt: string;
}

interface RawMigrationRestoreSuccessDialogData {
  onLogout: () => Promise<void>;
}

@Component({
  selector: 'taon-sudo-raw-migration-restore-success',
  template: `
    <h2 mat-dialog-title>{{ t.gettext('Raw Migration Restored Successfully') }}</h2>
    <mat-dialog-content>
      <p>{{ t.gettext('The raw migration has been restored successfully.') }}</p>
      <p>
        {{
          t.gettext(
            'Your current session may no longer be valid because database records could have changed.'
          )
        }}
      </p>
      <p>
        {{
          t.gettext(
            'For security and consistency, you need to sign in again.'
          )
        }}
      </p>
      @if (error()) {
        <p
          class="error"
          role="alert">
          {{ error() }}
        </p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button
        mat-flat-button
        type="button"
        [disabled]="busy()"
        (click)="logout()">
        {{
          busy()
            ? t.gettext('Logging out…')
            : attempted()
              ? t.gettext('Retry Log Out')
              : t.gettext('OK — Log Out')
        }}
      </button>
    </mat-dialog-actions>
  `,
  imports: [MatButtonModule, MatDialogModule],
  styles: [
    `
      :host {
        display: block;
        max-width: min(32rem, calc(100vw - 2rem));
      }
      mat-dialog-content {
        line-height: 1.5;
      }
      .error {
        color: #b3261e;
      }
    `,
  ],
})
class RawMigrationRestoreSuccessDialogComponent {
  readonly t = t.for(this);

  readonly busy = signal(false);

  readonly attempted = signal(false);

  readonly error = signal('');

  private readonly data = inject<RawMigrationRestoreSuccessDialogData>(
    MAT_DIALOG_DATA,
  );

  private readonly dialogRef = inject<
    MatDialogRef<RawMigrationRestoreSuccessDialogComponent, boolean>
  >(MatDialogRef);

  async logout(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.attempted.set(true);
    try {
      await this.data.onLogout();
      this.dialogRef.close(true);
    } catch (error) {
      this.error.set(
        error instanceof Error
          ? error.message
          : this.t.gettext('Logout could not be confirmed. Please retry.'),
      );
    } finally {
      this.busy.set(false);
    }
  }
}

@Component({
  selector: 'app-taon-sudo-raw-migrations-backoffice',
  templateUrl: './taon-sudo-raw-migrations-backoffice.component.html',
  styleUrls: ['./taon-sudo-raw-migrations-backoffice.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterOutlet,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
  ],
  providers: [
    TaonSudoRawMigrationsBackofficeApiService,
    TaonSessionApiService,
    TaonSessionConfigService,
    TaonSessionStateService,
  ],
})
export class TaonSudoRawMigrationsBackofficeComponent
  implements OnInit, OnDestroy
{
  private static restoreSuccessDialogOpen = false;

  private static readonly pendingRestoreStorageKey =
    'taon-dev:sudo:raw-migration-restore-ack:v1';

  //#region fields & getters
  t = t.for(this);

  private readonly api = inject(TaonSudoRawMigrationsBackofficeApiService);

  private readonly dialog = inject(MatDialog);

  private readonly sessionState = inject(TaonSessionStateService);

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

  /**
   * Real multipart upload progress (acknowledged bytes), null when idle.
   */
  readonly uploadProgress = signal<number | null>(null);

  private uploadAbortController: AbortController | null = null;

  private destroyed = false;

  private pendingAcknowledgement:
    | PendingRawMigrationRestoreAcknowledgement
    | undefined;
  //#endregion

  //#region methods / ng on init
  ngOnInit(): void {
    void this.loadContexts();
    this.showPendingRestoreAcknowledgement();
  }
  //#endregion

  //#region methods / ng on destroy
  ngOnDestroy(): void {
    this.destroyed = true;
    this.uploadAbortController?.abort();
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
    if (!context) {
      return;
    }
    await this.runRequest(
      this.t.gettext('Analyzing raw migration snapshot'),
      async () => {
        const report = await this.api.analyzeRestore(
          context,
          snapshot.id,
          this.clearAllData(),
        );
        const plan = await firstValueFrom(
          this.dialog
            .open<
              TaonSudoRawMigrationRestoreEditorComponent,
              TaonSudoRawMigrationRestoreEditorData,
              TaonSudoRawMigrationRestorePlan
            >(TaonSudoRawMigrationRestoreEditorComponent, {
              data: { contextName: context, report, api: this.api },
              panelClass: 'raw-migration-restore-dialog',
              width: '100vw',
              maxWidth: '100vw',
              height: '100dvh',
              maxHeight: '100dvh',
              disableClose: true,
            })
            .afterClosed(),
        );
        if (!plan) {
          this.statusMessage.set('');
          return;
        }
        this.statusMessage.set(
          this.t.gettext('Restoring raw migration snapshot'),
        );
        const job = await this.api.restoreSnapshot(context, snapshot.id, plan);
        await this.followJob(job);
        if (this.activeJob()?.status === 'completed') {
          this.requireRestoreAcknowledgement(context, snapshot.id);
        }
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
    const abortController = new AbortController();
    this.uploadAbortController = abortController;
    this.uploadProgress.set(0);
    await this.runRequest(
      this.t.gettext('Uploading raw migration ZIP ([[ size ]])', {
        size: this.formatBytes(file.size),
      }),
      async () => {
        try {
          const snapshot = await this.api.importSnapshot(context, file, name, {
            signal: abortController.signal,
            onProgress: percentage => this.uploadProgress.set(percentage),
            onUploaded: () => {
              this.uploadProgress.set(null);
              this.uploadAbortController = null;
              this.statusMessage.set(
                this.t.gettext('Importing raw migration ZIP'),
              );
            },
          });
          this.statusMessage.set(
            this.t.gettext('Snapshot imported: ') + snapshot.name,
          );
          await this.loadSnapshots();
        } catch (error) {
          if (abortController.signal.aborted) {
            this.statusMessage.set(
              this.t.gettext(
                'Upload cancelled. The unfinished multipart upload was aborted.',
              ),
            );
            return;
          }
          throw error;
        } finally {
          this.uploadProgress.set(null);
          this.uploadAbortController = null;
        }
      },
    );
  }
  //#endregion

  //#region methods / cancel upload
  cancelUpload(): void {
    this.uploadAbortController?.abort();
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

  //#region methods / require restore acknowledgement
  private requireRestoreAcknowledgement(
    contextName: string,
    snapshotId: string,
  ): void {
    const acknowledgement: PendingRawMigrationRestoreAcknowledgement = {
      version: 1,
      type: 'raw-migration-restore-success',
      contextName,
      snapshotId,
      createdAt: new Date().toISOString(),
    };
    this.pendingAcknowledgement = acknowledgement;
    try {
      globalThis.localStorage.setItem(
        TaonSudoRawMigrationsBackofficeComponent.pendingRestoreStorageKey,
        JSON.stringify(acknowledgement),
      );
    } catch (error) {
      this.errorMessage.set(
        this.t.gettext(
          'The restore succeeded, but its acknowledgement could not be saved in browser storage. Keep this page open until you log out.',
        ),
      );
      console.error('Could not persist raw migration restore acknowledgement.', error);
    }
    this.openRestoreSuccessDialog();
  }

  private showPendingRestoreAcknowledgement(): void {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const raw = globalThis.localStorage.getItem(
        TaonSudoRawMigrationsBackofficeComponent.pendingRestoreStorageKey,
      );
      if (!raw) {
        return;
      }
      const parsed: unknown = JSON.parse(raw);
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        (parsed as Partial<PendingRawMigrationRestoreAcknowledgement>).version !==
          1 ||
        (parsed as Partial<PendingRawMigrationRestoreAcknowledgement>).type !==
          'raw-migration-restore-success' ||
        typeof (parsed as Partial<PendingRawMigrationRestoreAcknowledgement>)
          .snapshotId !== 'string' ||
        typeof (parsed as Partial<PendingRawMigrationRestoreAcknowledgement>)
          .contextName !== 'string'
      ) {
        throw new Error(
          this.t.gettext(
            'The pending raw migration acknowledgement is invalid. Log out to clear the current session safely.',
          ),
        );
      }
      this.pendingAcknowledgement =
        parsed as PendingRawMigrationRestoreAcknowledgement;
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : this.t.gettext('Could not read the pending restore acknowledgement.'),
      );
      this.pendingAcknowledgement = {
        version: 1,
        type: 'raw-migration-restore-success',
        contextName: this.selectedContext(),
        snapshotId: 'unknown',
        createdAt: new Date().toISOString(),
      };
    }
    this.openRestoreSuccessDialog();
  }

  private openRestoreSuccessDialog(): void {
    if (
      !this.pendingAcknowledgement ||
      TaonSudoRawMigrationsBackofficeComponent.restoreSuccessDialogOpen
    ) {
      return;
    }
    TaonSudoRawMigrationsBackofficeComponent.restoreSuccessDialogOpen = true;
    const dialogRef = this.dialog.open(
      RawMigrationRestoreSuccessDialogComponent,
      {
        data: { onLogout: () => this.logoutAfterRestore() },
        disableClose: true,
        closeOnNavigation: false,
        hasBackdrop: true,
        ariaLabel: this.t.gettext(
          'Raw migration restored successfully. Sign in again.',
        ),
      },
    );
    dialogRef.afterClosed().subscribe(() => {
      TaonSudoRawMigrationsBackofficeComponent.restoreSuccessDialogOpen = false;
      if (!this.pendingAcknowledgement) {
        globalThis.location.reload();
      }
    });
  }

  private async logoutAfterRestore(): Promise<void> {
    if (!this.sessionState.active) {
      this.sessionState.activate({
        from: 'raw-migration-restore-logout',
      });
    }
    try {
      await firstValueFrom(
        this.sessionState.currentState$.pipe(
          filter(
            state =>
              state.currentState !==
              TaonSessionState.LOADING_INITIAL_AUTH_INFO,
          ),
          take(1),
          timeout({ first: 15000 }),
        ),
      );
    } catch {
      throw new Error(
        this.t.gettext(
          'Authentication state could not be loaded. Retry logout.',
        ),
      );
    }

    if (!this.sessionState.isLoggedIn()) {
      await firstValueFrom(
        this.sessionState.taonSessionApiService.logout().pipe(take(1)),
      );
      this.sessionState.refresh();
    } else {
      let logoutStarted = false;
      const loggedOut = firstValueFrom(
        this.sessionState.currentState$.pipe(
          tap(state => {
            if (state.currentState === TaonSessionState.LOADING_LOGOUT_INFO) {
              logoutStarted = true;
            }
          }),
          filter(
            state =>
              logoutStarted &&
              state.currentState === TaonSessionState.LOGIN_OR_REGISTER,
          ),
          take(1),
          timeout({ first: 15000 }),
        ),
      );
      this.sessionState.logout();
      try {
        await loggedOut;
      } catch {
        throw new Error(
          this.t.gettext(
            'Logout could not be confirmed. Your restore acknowledgement remains pending; retry logout.',
          ),
        );
      }
    }
    try {
      globalThis.localStorage.removeItem(
        TaonSudoRawMigrationsBackofficeComponent.pendingRestoreStorageKey,
      );
    } catch {
      throw new Error(
        this.t.gettext(
          'You are signed out, but the pending acknowledgement could not be cleared. Retry to finish safely.',
        ),
      );
    }
    this.pendingAcknowledgement = undefined;
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
