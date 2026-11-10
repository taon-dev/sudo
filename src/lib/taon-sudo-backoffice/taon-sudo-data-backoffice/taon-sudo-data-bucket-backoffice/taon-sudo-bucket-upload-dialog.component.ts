//#region imports
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CdkDrag } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Translation } from '@taon-dev/i18n/src';
import { Taon, type TaonStorageObject } from 'taon/src';

import { TaonSudoApiService } from '../../../taon-sudo/taon-sudo.api.service';
import { TaonSudoUtils } from '../../../taon-sudo/taon-sudo.utils';
//#endregion

const t = Translation.for(Taon.__FILE_RELATIVE_PATH, Taon.LANG_IMPORT_MAP);

export interface TaonSudoBucketUploadDialogData {
  mode: 'upload' | 'replace';
  contextName: string;
  controllerName: string;
  /**
   * Asset being replaced (replace mode only).
   */
  existing?: TaonStorageObject;
}

type UploadPhase =
  | 'idle'
  | 'uploading'
  | 'saving'
  | 'done'
  | 'cancelled'
  | 'error';

@Component({
  selector: 'taon-sudo-bucket-upload-dialog',
  templateUrl: './taon-sudo-bucket-upload-dialog.component.html',
  styleUrls: ['./taon-sudo-bucket-upload-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkDrag,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
  ],
})
export class TaonSudoBucketUploadDialogComponent implements OnDestroy {
  readonly t = t.for(this);

  readonly data = inject<TaonSudoBucketUploadDialogData>(MAT_DIALOG_DATA);

  readonly formatBytes = TaonSudoUtils.formatBytes;

  readonly file = signal<File | undefined>(undefined);

  readonly targetKey = signal(this.data.existing?.key || '');

  readonly phase = signal<UploadPhase>('idle');

  readonly progress = signal(0);

  readonly message = signal('');

  readonly busy = computed(
    () => this.phase() === 'uploading' || this.phase() === 'saving',
  );

  readonly isReplace = this.data.mode === 'replace';

  readonly canStart = computed(
    () =>
      !!this.file() &&
      !this.busy() &&
      this.phase() !== 'done' &&
      (this.isReplace || !!this.targetKey().trim()),
  );

  private readonly api = inject(TaonSudoApiService);

  private readonly ref = inject(
    MatDialogRef<
      TaonSudoBucketUploadDialogComponent,
      TaonStorageObject | undefined
    >,
  );

  private abortController: AbortController | undefined;

  private keyEditedByUser = false;

  constructor() {
    this.ref.disableClose = true;
  }

  fileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // selecting a file never starts the upload
    this.file.set(file);
    this.phase.set('idle');
    this.progress.set(0);
    this.message.set('');
    if (file && !this.isReplace && !this.keyEditedByUser) {
      this.targetKey.set(file.name);
    }
  }

  keyChanged(event: Event): void {
    this.keyEditedByUser = true;
    this.targetKey.set((event.target as HTMLInputElement).value);
  }

  async start(): Promise<void> {
    const file = this.file();
    if (!file || !this.canStart()) {
      return;
    }
    const abortController = new AbortController();
    this.abortController = abortController;
    this.phase.set('uploading');
    this.progress.set(0);
    this.message.set('');
    try {
      const result = await this.api.uploadBucketFileMultipart(
        this.data.contextName,
        this.data.controllerName,
        file,
        {
          targetKey: this.isReplace
            ? this.data.existing!.key
            : this.targetKey().trim(),
          replace: this.isReplace,
          signal: abortController.signal,
          onProgress: percentage =>
            this.progress.set(Math.round(percentage)),
          onUploaded: () => {
            this.progress.set(100);
            this.phase.set('saving');
          },
        },
      );
      this.phase.set('done');
      this.message.set(
        this.isReplace
          ? this.t.gettext('Asset replaced successfully.')
          : this.t.gettext('Asset uploaded successfully.'),
      );
      this.ref.close(result);
    } catch (error: unknown) {
      if (abortController.signal.aborted) {
        this.phase.set('cancelled');
        this.message.set(this.t.gettext('Upload cancelled.'));
      } else {
        console.error('[taon-sudo-bucket-upload-dialog] Upload failed', error);
        this.phase.set('error');
        this.message.set(this.errorMessage(error));
      }
    } finally {
      if (this.abortController === abortController) {
        this.abortController = undefined;
      }
    }
  }

  /**
   * Aborts an active upload (dialog stays open); otherwise closes the dialog.
   */
  cancel(): void {
    if (this.phase() === 'uploading' && this.abortController) {
      this.abortController.abort();
      return;
    }
    if (this.phase() === 'saving') {
      // server side copy cannot be aborted safely - wait for the result
      return;
    }
    this.ref.close(undefined);
  }

  ngOnDestroy(): void {
    this.abortController?.abort();
  }

  private errorMessage(error: unknown): string {
    const body = (error as { body?: { json?: { message?: string } } })?.body;
    const message =
      body?.json?.message || (error instanceof Error ? error.message : '');
    return message
      ? this.t.gettext('Upload failed: [[ message ]]', { message })
      : this.t.gettext('Upload failed. Please try again.');
  }
}
