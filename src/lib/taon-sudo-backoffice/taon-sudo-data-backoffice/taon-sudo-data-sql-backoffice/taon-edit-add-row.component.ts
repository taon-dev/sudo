import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, FormRecord, ReactiveFormsModule } from '@angular/forms';
import { CdkDrag } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Translation } from '@taon-dev/i18n/src';
import { Taon } from 'taon/src';
import { TaonSudoSqlColumn } from '../../../taon-sudo/taon-sudo.api.service';

const t = Translation.for(Taon.__FILE_RELATIVE_PATH, Taon.LANG_IMPORT_MAP);

export interface TaonEditAddRowDialogData {
  mode: 'add' | 'edit';
  columns: TaonSudoSqlColumn[];
  row?: Record<string, unknown>;
}

@Component({
  selector: 'taon-edit-add-row',
  templateUrl: './taon-edit-add-row.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkDrag,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule,
  ],
})
export class TaonEditAddRowComponent {
  readonly t = t.for(this);
  readonly data = inject<TaonEditAddRowDialogData>(MAT_DIALOG_DATA);
  readonly form = new FormRecord<FormControl<unknown>>({});

  private readonly ref = inject(
    MatDialogRef<TaonEditAddRowComponent, Record<string, unknown>>,
  );

  constructor() {
    for (const column of this.editableColumns) {
      const control = new FormControl<unknown>(
        this.data.row?.[column.propertyName] ?? null,
      );
      if (this.data.mode === 'edit' && column.generated) {
        control.disable();
      }
      this.form.addControl(column.propertyName, control);
    }
  }

  get editableColumns(): TaonSudoSqlColumn[] {
    return this.data.columns.filter(
      column => this.data.mode === 'edit' || !column.generated,
    );
  }

  inputType(column: TaonSudoSqlColumn): string {
    const type = column.type.toLowerCase();
    if (
      [
        'int',
        'integer',
        'bigint',
        'smallint',
        'float',
        'double',
        'real',
        'decimal',
        'numeric',
      ].includes(type)
    ) {
      return 'number';
    }
    if (type === 'date') {
      return 'date';
    }
    return 'text';
  }

  isBoolean(column: TaonSudoSqlColumn): boolean {
    return column.type.toLowerCase().includes('bool');
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.ref.close(this.form.getRawValue());
  }

  cancel(): void {
    this.ref.close();
  }
}
