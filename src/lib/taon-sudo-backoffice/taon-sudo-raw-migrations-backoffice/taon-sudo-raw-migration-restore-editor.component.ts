import {
  ChangeDetectionStrategy,
  Component,
  computed,
  OnDestroy,
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
  TaonSudoRawMigrationColumn,
  TaonSudoRawMigrationColumnValueMapping,
  TaonSudoRawMigrationColumnValueStrategy,
  TaonSudoRawMigrationEntityMapping,
  TaonSudoRawMigrationPlanValidation,
  TaonSudoRawMigrationRestorePlan,
  TaonSudoRawMigrationSchemaEntity,
} from '../../taon-sudo/taon-sudo-raw-migration.models';
import { hasColumnValueStrategy } from '../../taon-sudo/taon-sudo-raw-migration.utils';

import { TaonSudoRawMigrationsBackofficeApiService } from './taon-sudo-raw-migrations-backoffice.api.service';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatListModule, MatSelectionListChange } from '@angular/material/list';

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
    MatExpansionModule,
    MatListModule,
  ],
})
export class TaonSudoRawMigrationRestoreEditorComponent implements OnDestroy {
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
        (this.destinationEntity(mapping)?.name || '')
          .toLowerCase()
          .includes(search) ||
        (mapping.destinationTableName || '').toLowerCase().includes(search)
      );
    });
  });

  readonly selectedMappings = computed(() =>
    this.plan().entities.filter(mapping => mapping.selected),
  );

  readonly tableNames = computed(() => {
    const names = new Set<string>();
    for (const mapping of this.plan().entities) {
      const source = this.sourceEntity(mapping);
      // names.add(source.name);
      names.add(source.tableName);
      const destination = this.destinationEntity(mapping);
      if (destination) {
        // names.add(destination.name);
        names.add(destination.tableName);
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  });

  readonly selectedTable = computed(() => {
    const currentSearch = this.search().trim().toLowerCase();
    return (
      this.tableNames().find(name => name.toLowerCase() === currentSearch) || ''
    );
  });

  private validationTimer?: ReturnType<typeof setTimeout>;

  private validationRequest = 0;

  onTableSelectionChange({ options }: MatSelectionListChange): void {
    for (const option of options) {
      this.setEntitySelected(option.value, option.selected);
    }
  }

  onBucketSelectionChange({ options }: MatSelectionListChange): void {
    for (const option of options) {
      this.setBucketSelected(option.value, option.selected);
    }
  }

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
    if (step === 1 || step === 3) {
      void this.refreshValidation();
    }
  }

  setSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  setSelectedTable(tableName: string): void {
    this.search.set(tableName);
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
      columnValues: this.defaultColumnValues(source, destination),
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
      columnValues:
        destinationColumn === null
          ? current.columnValues
          : current.columnValues?.filter(
              value => value.destinationColumn !== destinationColumn,
            ),
    }));
  }

  missingDestinationColumns(
    mapping: TaonSudoRawMigrationEntityMapping,
    destination: TaonSudoRawMigrationSchemaEntity,
  ): TaonSudoRawMigrationColumn[] {
    const mapped = new Set(
      mapping.columns
        .map(column => column.destinationColumn)
        .filter((name): name is string => name !== null),
    );
    return destination.columns.filter(
      column => !mapped.has(column.databaseName),
    );
  }

  columnValueMapping(
    mapping: TaonSudoRawMigrationEntityMapping,
    destinationColumn: string,
  ): TaonSudoRawMigrationColumnValueMapping {
    return (
      mapping.columnValues?.find(
        value => value.destinationColumn === destinationColumn,
      ) || { destinationColumn }
    );
  }

  isRequiredColumn(column: TaonSudoRawMigrationColumn): boolean {
    return (
      !column.nullable && !column.generated && column.default === undefined
    );
  }

  isNumericColumn(type: string | undefined): boolean {
    return this.sqlTypeFamily(type) === 'number';
  }

  isBooleanColumn(type: string | undefined): boolean {
    return this.sqlTypeFamily(type) === 'boolean';
  }

  availableValueStrategies(
    destination: TaonSudoRawMigrationColumn,
    source: TaonSudoRawMigrationSchemaEntity,
  ): TaonSudoRawMigrationColumnValueStrategy[] {
    const family = this.sqlTypeFamily(destination.type);
    const strategies: TaonSudoRawMigrationColumnValueStrategy[] = [];
    if (destination.nullable) {
      strategies.push('set-null');
    }
    if (destination.default !== undefined) {
      strategies.push('database-default');
    }
    strategies.push('constant');
    if (family === 'number' || family === 'string') {
      strategies.push('sequential', 'random');
    }
    if (family === 'string') {
      strategies.push('uuid', 'hash');
    }
    if (family === 'date') {
      strategies.push('current-timestamp');
    }
    if (
      source.columns.some(column =>
        this.columnTypesCompatible(column, destination),
      )
    ) {
      strategies.push('copy');
    }
    return strategies;
  }

  setColumnValueStrategy(
    mapping: TaonSudoRawMigrationEntityMapping,
    column: TaonSudoRawMigrationColumn,
    strategy: TaonSudoRawMigrationColumnValueStrategy | '',
  ): void {
    let valueMapping: TaonSudoRawMigrationColumnValueMapping = {
      destinationColumn: column.databaseName,
    };
    if (strategy === 'constant') {
      valueMapping = { ...valueMapping, strategy, value: undefined };
    } else if (strategy === 'sequential') {
      valueMapping = { ...valueMapping, strategy, start: 1, step: 1 };
    } else if (strategy === 'random') {
      valueMapping = { ...valueMapping, strategy, min: 0, max: 999 };
    } else if (strategy === 'hash') {
      valueMapping = {
        ...valueMapping,
        strategy,
        algorithm: 'sha256',
        mode: 'deterministic',
        sourceColumns: [],
      };
    } else if (strategy === 'copy') {
      valueMapping = { ...valueMapping, strategy, sourceColumn: undefined };
    } else if (strategy) {
      valueMapping = { ...valueMapping, strategy };
    }
    this.updateColumnValue(mapping, valueMapping);
  }

  setColumnConstant(
    mapping: TaonSudoRawMigrationEntityMapping,
    column: TaonSudoRawMigrationColumn,
    event: Event,
  ): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    const current = this.columnValueMapping(mapping, column.databaseName);
    if (current.strategy !== 'constant') {
      return;
    }
    const family = this.sqlTypeFamily(column.type);
    const parsedNumber = target.value === '' ? undefined : target.valueAsNumber;
    const value =
      family === 'number'
        ? parsedNumber !== undefined && Number.isFinite(parsedNumber)
          ? parsedNumber
          : undefined
        : target.value === ''
          ? undefined
          : target.value;
    this.updateColumnValue(mapping, { ...current, value });
  }

  setColumnBooleanConstant(
    mapping: TaonSudoRawMigrationEntityMapping,
    columnName: string,
    value: boolean,
  ): void {
    const current = this.columnValueMapping(mapping, columnName);
    if (current.strategy === 'constant') {
      this.updateColumnValue(mapping, { ...current, value });
    }
  }

  setSequentialValue(
    mapping: TaonSudoRawMigrationEntityMapping,
    columnName: string,
    field: 'start' | 'step',
    event: Event,
  ): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    const current = this.columnValueMapping(mapping, columnName);
    if (current.strategy === 'sequential') {
      this.updateColumnValue(mapping, {
        ...current,
        [field]:
          target.value !== '' && Number.isFinite(target.valueAsNumber)
            ? target.valueAsNumber
            : undefined,
      });
    }
  }

  setRandomValue(
    mapping: TaonSudoRawMigrationEntityMapping,
    columnName: string,
    field: 'min' | 'max',
    event: Event,
  ): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    const current = this.columnValueMapping(mapping, columnName);
    if (current.strategy === 'random') {
      this.updateColumnValue(mapping, {
        ...current,
        [field]:
          target.value !== '' && Number.isSafeInteger(target.valueAsNumber)
            ? target.valueAsNumber
            : undefined,
      });
    }
  }

  setHashSourceColumns(
    mapping: TaonSudoRawMigrationEntityMapping,
    columnName: string,
    sourceColumns: string[],
  ): void {
    const current = this.columnValueMapping(mapping, columnName);
    if (current.strategy === 'hash') {
      this.updateColumnValue(mapping, { ...current, sourceColumns });
    }
  }

  setHashMode(
    mapping: TaonSudoRawMigrationEntityMapping,
    columnName: string,
    mode: 'deterministic' | 'random',
  ): void {
    const current = this.columnValueMapping(mapping, columnName);

    if (!hasColumnValueStrategy(current) || current.strategy !== 'hash') {
      return;
    }

    this.updateColumnValue(mapping, {
      ...current,
      mode,
      sourceColumns: mode === 'random' ? [] : current.sourceColumns,
    });
  }

  setCopySourceColumn(
    mapping: TaonSudoRawMigrationEntityMapping,
    columnName: string,
    sourceColumn: string,
  ): void {
    const current = this.columnValueMapping(mapping, columnName);
    if (current.strategy === 'copy') {
      this.updateColumnValue(mapping, { ...current, sourceColumn });
    }
  }

  strategyLabel(strategy: TaonSudoRawMigrationColumnValueStrategy): string {
    const labels: Record<TaonSudoRawMigrationColumnValueStrategy, string> = {
      'set-null': this.t.gettext('Set NULL'),
      'database-default': this.t.gettext('Use database default'),
      constant: this.t.gettext('Set constant value'),
      sequential: this.t.gettext('Generate sequential number'),
      random: this.t.gettext('Generate random number'),
      uuid: this.t.gettext('Generate UUID v4'),
      hash: this.t.gettext('Generate SHA-256 hash'),
      'current-timestamp': this.t.gettext('Use current timestamp'),
      copy: this.t.gettext('Copy from snapshot column'),
    };
    return labels[strategy];
  }

  strategyDescription(
    mapping: TaonSudoRawMigrationEntityMapping,
    destinationColumn: string,
  ): string {
    const value = this.columnValueMapping(mapping, destinationColumn);

    if (!hasColumnValueStrategy(value)) {
      const column = this.destinationEntity(mapping)?.columns.find(
        candidate => candidate.databaseName === destinationColumn,
      );

      if (column?.generated) {
        return this.t.gettext('Generated by database');
      }

      if (column?.default !== undefined) {
        return this.t.gettext('Database default will be used');
      }

      return this.t.gettext('No value strategy selected');
    }

    switch (value.strategy) {
      case 'set-null':
        return this.t.gettext('Set NULL');
      case 'database-default':
        return this.t.gettext('Use database default');
      case 'constant':
        return `${this.t.gettext('Constant')}: ${String(value.value ?? '')}`;
      case 'sequential':
        return `${this.t.gettext('Sequential')}: start ${value.start}, step ${value.step}`;
      case 'random':
        return `${this.t.gettext('Random integer')}: ${value.min}–${value.max} (${this.t.gettext('generated during restore')})`;
      case 'uuid':
        return this.t.gettext('Generated UUID v4 per row');
      case 'hash':
        return value.mode === 'random'
          ? this.t.gettext(
              'Random SHA-256 hash per row; generated during restore',
            )
          : `${this.t.gettext('SHA-256 of')}: ${(value.sourceColumns ?? []).join(', ')}`;
      case 'current-timestamp':
        return this.t.gettext('Current timestamp per row');
      case 'copy':
        return `${this.t.gettext('Copy from snapshot column')}: ${value.sourceColumn ?? ''}`;
      default:
        return this.t.gettext('No value strategy selected');
    }
  }

  columnValueError(
    destinationTable: string,
    destinationColumn: string,
  ): string | undefined {
    return this.validation()?.errors.find(
      issue =>
        issue.destinationTableName === destinationTable &&
        issue.destinationColumn === destinationColumn,
    )?.message;
  }

  compatibleCopySourceColumns(
    destination: TaonSudoRawMigrationColumn,
    source: TaonSudoRawMigrationSchemaEntity,
  ): TaonSudoRawMigrationColumn[] {
    return source.columns.filter(column =>
      this.columnTypesCompatible(column, destination),
    );
  }

  setClearAllData(clearAllData: boolean): void {
    this.plan.update(plan => ({ ...plan, clearAllData }));
    this.scheduleValidation();
  }

  setBucketSelected(name: string, selected: boolean): void {
    this.plan.update(plan => ({
      ...plan,
      bucketControllers: selected
        ? [...new Set([...plan.bucketControllers, name])]
        : plan.bucketControllers.filter(item => item !== name),
    }));
    this.scheduleValidation();
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
    this.scheduleValidation();
  }

  async refreshValidation(): Promise<void> {
    const request = ++this.validationRequest;
    this.validating.set(true);
    this.errorMessage.set('');
    try {
      const validation = await this.data.api.validateRestorePlan(
        this.data.contextName,
        this.plan(),
      );
      if (request === this.validationRequest) {
        this.validation.set(validation);
      }
    } catch (error) {
      if (request === this.validationRequest) {
        this.validation.set(null);
        this.errorMessage.set(
          error instanceof Error
            ? error.message
            : this.t.gettext('Restore plan validation failed.'),
        );
      }
    } finally {
      if (request === this.validationRequest) {
        this.validating.set(false);
      }
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
      if (
        parsed.entities.some(
          mapping =>
            !this.data.report.snapshotEntities.some(
              entity => entity.tableName === mapping.sourceTableName,
            ),
        )
      ) {
        throw new Error(
          this.t.gettext(
            'The restore plan references a snapshot table that is unavailable.',
          ),
        );
      }
      const importedPlan = structuredClone(parsed);
      importedPlan.entities = importedPlan.entities.map(mapping => {
        const source = this.data.report.snapshotEntities.find(
          entity => entity.tableName === mapping.sourceTableName,
        );
        const destination = this.data.report.currentEntities.find(
          entity => entity.tableName === mapping.destinationTableName,
        );
        if (!source || !destination) {
          return mapping;
        }
        const existing = new Set(
          (mapping.columnValues || []).map(value => value.destinationColumn),
        );
        const safeNullableDefaults = this.defaultColumnValues(
          source,
          destination,
        ).filter(value => value.strategy === 'set-null');
        return {
          ...mapping,
          columnValues: [
            ...(mapping.columnValues || []),
            ...safeNullableDefaults.filter(
              value => !existing.has(value.destinationColumn),
            ),
          ],
        };
      });
      this.plan.set(importedPlan);
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
    this.scheduleValidation();
  }

  private updateColumnValue(
    mapping: TaonSudoRawMigrationEntityMapping,
    valueMapping: TaonSudoRawMigrationColumnValueMapping,
  ): void {
    this.updateMapping(mapping.sourceTableName, current => ({
      ...current,
      columnValues: [
        ...(current.columnValues || []).filter(
          value => value.destinationColumn !== valueMapping.destinationColumn,
        ),
        valueMapping,
      ],
    }));
  }

  private defaultColumnValues(
    source: TaonSudoRawMigrationSchemaEntity,
    destination?: TaonSudoRawMigrationSchemaEntity,
  ): TaonSudoRawMigrationColumnValueMapping[] {
    if (!destination) {
      return [];
    }
    const mappedNames = new Set(
      source.columns.map(
        sourceColumn =>
          destination.columns.find(
            candidate =>
              candidate.databaseName === sourceColumn.databaseName ||
              (!!sourceColumn.propertyPath &&
                candidate.propertyPath === sourceColumn.propertyPath),
          )?.databaseName || '',
      ),
    );
    return destination.columns
      .filter(column => !mappedNames.has(column.databaseName))
      .map(column => ({
        destinationColumn: column.databaseName,
        ...(column.nullable
          ? { strategy: 'set-null' as const }
          : column.default !== undefined
            ? { strategy: 'database-default' as const }
            : {}),
      }));
  }

  private sqlTypeFamily(
    type: string | undefined,
  ): 'number' | 'string' | 'boolean' | 'date' | 'other' {
    const normalized = (type || '')
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/\(.*/, '');
    if (
      /^(tinyint|smallint|mediumint|int|integer|bigint|serial|smallserial|bigserial|decimal|numeric|float|double|real|number)/.test(
        normalized,
      )
    ) {
      return 'number';
    }
    if (/^(bool|boolean)$/.test(normalized)) {
      return 'boolean';
    }
    if (/^(date|datetime|timestamp|timestamptz|time|timetz)/.test(normalized)) {
      return 'date';
    }
    if (
      /^(char|varchar|nvarchar|nchar|text|string|clob|uuid|enum|json)/.test(
        normalized,
      )
    ) {
      return 'string';
    }
    return 'other';
  }

  private columnTypesCompatible(
    source: TaonSudoRawMigrationColumn,
    destination: TaonSudoRawMigrationColumn,
  ): boolean {
    if (!source.type || !destination.type) {
      return true;
    }
    const normalize = (type: string) =>
      type.toLowerCase().replace(/\s+/g, '').replace(/\(.*/, '');
    const sourceType = normalize(source.type);
    const destinationType = normalize(destination.type);
    if (sourceType === destinationType) {
      return true;
    }
    const families = [
      ['int', 'integer', 'bigint', 'smallint', 'tinyint', 'number'],
      ['varchar', 'nvarchar', 'char', 'text', 'string', 'clob'],
      ['bool', 'boolean'],
      ['date', 'datetime', 'timestamp', 'timestamptz'],
      ['blob', 'binary', 'varbinary', 'bytea', 'buffer'],
      ['decimal', 'numeric', 'float', 'double', 'real'],
    ];
    return families.some(
      family => family.includes(sourceType) && family.includes(destinationType),
    );
  }

  private scheduleValidation(): void {
    if (this.step() < 1) {
      return;
    }
    if (this.validationTimer) {
      clearTimeout(this.validationTimer);
    }
    this.validationTimer = setTimeout(() => {
      void this.refreshValidation();
    }, 250);
  }

  ngOnDestroy(): void {
    if (this.validationTimer) {
      clearTimeout(this.validationTimer);
    }
    this.validationRequest++;
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
      plan.entities.every(
        mapping =>
          !!mapping &&
          typeof mapping.sourceTableName === 'string' &&
          (mapping.destinationTableName === null ||
            typeof mapping.destinationTableName === 'string') &&
          typeof mapping.selected === 'boolean' &&
          Array.isArray(mapping.columns) &&
          mapping.columns.every(
            column =>
              !!column &&
              typeof column.sourceColumn === 'string' &&
              (column.destinationColumn === null ||
                typeof column.destinationColumn === 'string'),
          ) &&
          (mapping.columnValues === undefined ||
            (Array.isArray(mapping.columnValues) &&
              mapping.columnValues.every(
                value =>
                  !!value &&
                  typeof value.destinationColumn === 'string' &&
                  (value.strategy === undefined ||
                    [
                      'set-null',
                      'database-default',
                      'constant',
                      'sequential',
                      'random',
                      'uuid',
                      'hash',
                      'current-timestamp',
                      'copy',
                    ].includes(value.strategy)),
              ))),
      ) &&
      Array.isArray(plan.bucketControllers) &&
      plan.bucketControllers.every(name => typeof name === 'string')
    );
  }
}
