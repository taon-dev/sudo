//#region imports
import { CdkDrag } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Translation } from '@taon-dev/i18n/src';
import { firstValueFrom } from 'rxjs';
import { Taon } from 'taon/src';
//#endregion

const t = Translation.for(Taon.__FILE_RELATIVE_PATH, Taon.LANG_IMPORT_MAP);

export interface TaonSudoConfirmDialogData {
  title: string;
  message: string;
  /**
   * Additional (highlighted) warning lines.
   */
  details?: string[];
  confirmLabel?: string;
  /**
   * Destructive action - confirm button uses warn color.
   */
  destructive?: boolean;
  /**
   * When set, the user must type this exact phrase to confirm.
   */
  requiredPhrase?: string;
}

@Component({
  selector: 'taon-sudo-confirm-dialog',
  templateUrl: './taon-sudo-confirm-dialog.component.html',
  styles: [
    `
      .confirm-detail {
        margin: 4px 0;
      }
      .confirm-detail-warn {
        color: var(--mat-sys-error, #b3261e);
        font-weight: 500;
      }
      .confirm-phrase {
        width: 100%;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkDrag,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
})
export class TaonSudoConfirmDialogComponent {
  readonly t = t.for(this);

  readonly data = inject<TaonSudoConfirmDialogData>(MAT_DIALOG_DATA);

  readonly typedPhrase = signal('');

  readonly canConfirm = computed(
    () =>
      !this.data.requiredPhrase ||
      this.typedPhrase().trim() === this.data.requiredPhrase,
  );

  /**
   * Opens the dialog and resolves to true only on explicit confirmation.
   */
  static async confirm(
    dialog: MatDialog,
    data: TaonSudoConfirmDialogData,
  ): Promise<boolean> {
    const ref = dialog.open<
      TaonSudoConfirmDialogComponent,
      TaonSudoConfirmDialogData,
      boolean
    >(TaonSudoConfirmDialogComponent, {
      data,
      width: '520px',
      maxWidth: '95vw',
      autoFocus: data.requiredPhrase ? 'first-tabbable' : 'dialog',
    });
    return (await firstValueFrom(ref.afterClosed())) === true;
  }

  onPhraseInput(event: Event): void {
    this.typedPhrase.set((event.target as HTMLInputElement).value);
  }
}
