import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Translation } from '@taon-dev/i18n/src';
import { Taon } from 'taon/src';

import {
  TaonSudoRawMigrationCompatibilityReport,
  TaonSudoRawMigrationEntityMapping,
  TaonSudoRawMigrationPlanValidation,
  TaonSudoRawMigrationRestorePlan,
} from '../../taon-sudo/taon-sudo-raw-migration.models';

import { TaonSudoRawMigrationsBackofficeApiService } from './taon-sudo-raw-migrations-backoffice.api.service';

const t = Translation.for(Taon.__FILE_RELATIVE_PATH, Taon.LANG_IMPORT_MAP);

export interface TaonSudoRawMigrationRestoreEditorData {
  contextName: string;
  report: TaonSudoRawMigrationCompatibilityReport;
  api: TaonSudoRawMigrationsBackofficeApiService;
}

@Component({
  selector: 'taon-sudo-raw-migration-restore-editor',
  templateUrl: './taon-sudo-raw-migration-restore-editor.component.html',
  styleUrls: ['./taon-sudo-raw-migration-restore-editor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
})
export class TaonSudoRawMigrationRestoreEditorComponent {
  readonly t = t.for(this);

  readonly data =
    inject<TaonSudoRawMigrationRestoreEditorData>(MAT_DIALOG_DATA);

  private readonly dialogRef: MatDialogRef<
    TaonSudoRawMigrationRestoreEditorComponent,
    TaonSudoRawMigrationRestorePlan
  > = inject(MatDialogRef);

  readonly plan = signal<TaonSudoRawMigrationRestorePlan>(
    structuredClone(this.data.report.suggestedPlan),
  );

  readonly step = signal(this.data.report.schemasCompatible ? 2 : 0);

  readonly search = signal('');

  readonly validation = signal<TaonSudoRawMigrationPlanValidation | null>(null);

  readonly validating = signal(false);

  readonly errorMessage = signal('');

  readonly stepLabels = [
    this.t.gettext('Entity Mapping'),
    this.t.gettext('Column Mapping'),
    this.t.gettext('Select Tables'),
    this.t.gettext('Restore Preview'),
  ];

  readonly filteredMappings = computed(() => {
    const search = this.search().trim().toLowerCase();
    return this.plan().entities.filter(mapping => {
      if (!search) {
        return true;
      }
      const source = this.sourceEntity(mapping);
      return (
        source.name.toLowerCase().includes(search) ||
        source.tableName.toLowerCase().includes(search) ||
        (mapping.destinationTableName || '').toLowerCase().includes(search)
      );
    });
  });

  sourceEntity(mapping: TaonSudoRawMigrationEntityMapping) {
    return this.data.report.snapshotEntities.find(
      entity => entity.tableName === mapping.sourceTableName,
    )!;
  }

  destinationEntity(mapping: TaonSudoRawMigrationEntityMapping) {
    return this.data.report.currentEntities.find(
      entity => entity.tableName === mapping.destinationTableName,
    );
  }

  setStep(step: number): void {
    this.step.set(step);
    this.errorMessage.set('');
    if (step === 3) {
      void this.refreshValidation();
    }
  }

  setSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  setEntitySelected(
    mapping: TaonSudoRawMigrationEntityMapping,
    selected: boolean,
  ): void {
    this.updateMapping(mapping.sourceTableName, current => ({
      ...current,
      selected,
    }));
  }

  setEntityDestination(
    mapping: TaonSudoRawMigrationEntityMapping,
    destinationTableName: string | null,
  ): void {
    const source = this.sourceEntity(mapping);
    const destination = this.data.report.currentEntities.find(
      entity => entity.tableName === destinationTableName,
    );
    this.updateMapping(mapping.sourceTableName, current => ({
      ...current,
      destinationTableName,
      selected: destinationTableName !== null,
      columns: source.columns.map(column => ({
        sourceColumn: column.databaseName,
        destinationColumn:
          destination?.columns.find(
            candidate =>
              candidate.databaseName === column.databaseName ||
              (!!column.propertyPath &&
                candidate.propertyPath === column.propertyPath),
          )?.databaseName || null,
      })),
    }));
  }

  setColumnDestination(
    mapping: TaonSudoRawMigrationEntityMapping,
    sourceColumn: string,
    destinationColumn: string | null,
  ): void {
    this.updateMapping(mapping.sourceTableName, current => ({
      ...current,
      columns: current.columns.map(column =>
        column.sourceColumn === sourceColumn
          ? { ...column, destinationColumn }
          : column,
      ),
    }));
  }

  setClearAllData(clearAllData: boolean): void {
    this.plan.update(plan => ({ ...plan, clearAllData }));
  }

  setBucketSelected(name: string, selected: boolean): void {
    this.plan.update(plan => ({
      ...plan,
      bucketControllers: selected
        ? [...new Set([...plan.bucketControllers, name])]
        : plan.bucketControllers.filter(item => item !== name),
    }));
  }

  isBucketSelected(name: string): boolean {
    return this.plan().bucketControllers.includes(name);
  }

  selectAll(selected: boolean): void {
    this.plan.update(plan => ({
      ...plan,
      entities: plan.entities.map(mapping => ({
        ...mapping,
        selected: selected && mapping.destinationTableName !== null,
      })),
      bucketControllers: selected
        ? this.data.report.snapshotBucketControllers.filter(name =>
            this.data.report.currentBucketControllers.includes(name),
          )
        : [],
    }));
  }

  async refreshValidation(): Promise<void> {
    this.validating.set(true);
    this.errorMessage.set('');
    try {
      this.validation.set(
        await this.data.api.validateRestorePlan(
          this.data.contextName,
          this.plan(),
        ),
      );
    } catch (error) {
      this.validation.set(null);
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : this.t.gettext('Restore plan validation failed.'),
      );
    } finally {
      this.validating.set(false);
    }
  }

  async confirmRestore(): Promise<void> {
    await this.refreshValidation();
    if (this.validation()?.valid) {
      this.dialogRef.close(structuredClone(this.plan()));
    }
  }

  downloadPlan(): void {
    const blob = new Blob([JSON.stringify(this.plan(), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `raw-migration-restore-${this.plan().snapshotId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async importPlan(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    this.errorMessage.set('');
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!this.isRestorePlan(parsed)) {
        throw new Error(
          this.t.gettext('The selected file is not a supported restore plan.'),
        );
      }
      if (
        parsed.snapshotId !== this.data.report.snapshotId ||
        parsed.snapshotSchemaFingerprint !==
          this.data.report.snapshotSchemaFingerprint
      ) {
        throw new Error(
          this.t.gettext(
            'This restore plan belongs to a different snapshot schema.',
          ),
        );
      }
      if (
        parsed.currentSchemaFingerprint !==
        this.data.report.currentSchemaFingerprint
      ) {
        throw new Error(
          this.t.gettext(
            'This restore plan targets an outdated database schema.',
          ),
        );
      }
      this.plan.set(structuredClone(parsed));
      this.step.set(3);
      await this.refreshValidation();
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : this.t.gettext('Could not import restore plan.'),
      );
    }
  }

  private updateMapping(
    sourceTableName: string,
    update: (
      mapping: TaonSudoRawMigrationEntityMapping,
    ) => TaonSudoRawMigrationEntityMapping,
  ): void {
    this.validation.set(null);
    this.plan.update(plan => ({
      ...plan,
      entities: plan.entities.map(mapping =>
        mapping.sourceTableName === sourceTableName ? update(mapping) : mapping,
      ),
    }));
  }

  private isRestorePlan(
    value: unknown,
  ): value is TaonSudoRawMigrationRestorePlan {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const plan = value as Partial<TaonSudoRawMigrationRestorePlan>;
    return (
      plan.format === 'taon-sudo-raw-migration-restore-plan' &&
      plan.version === 1 &&
      typeof plan.snapshotId === 'string' &&
      typeof plan.snapshotSchemaFingerprint === 'string' &&
      typeof plan.currentSchemaFingerprint === 'string' &&
      typeof plan.clearAllData === 'boolean' &&
      Array.isArray(plan.entities) &&
      Array.isArray(plan.bucketControllers)
    );
  }
}
