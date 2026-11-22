export interface TaonSudoRawMigrationFile {
  file: string;
  key: string;
  size: number;
  contentType?: string;
  fileName?: string;
  metadata?: Record<string, string>;
}

export interface TaonSudoRawMigrationEntity {
  name: string;
  tableName: string;
  columns: string[];
  file: string;
  columnMetadata?: TaonSudoRawMigrationColumn[];
  foreignKeys?: TaonSudoRawMigrationForeignKey[];
}

export interface TaonSudoRawMigrationColumn {
  databaseName: string;
  propertyPath?: string;
  type?: string;
  primary?: boolean;
  nullable?: boolean;
  generated?: boolean;
  default?: string;
}

export interface TaonSudoRawMigrationForeignKey {
  columns: string[];
  referencedTableName: string;
  referencedColumns: string[];
}

export interface TaonSudoRawMigrationSchemaEntity {
  name: string;
  tableName: string;
  columns: TaonSudoRawMigrationColumn[];
  foreignKeys: TaonSudoRawMigrationForeignKey[];
}

export interface TaonSudoRawMigrationBucketController {
  name: string;
  files: TaonSudoRawMigrationFile[];
}

export interface TaonSudoRawMigrationManifest {
  format: 'taon-sudo-raw-migration';
  version: 1 | 2;
  id: string;
  contextName: string;
  name: string;
  createdAt: string;
  sqlEntities: TaonSudoRawMigrationEntity[];
  bucketControllers: TaonSudoRawMigrationBucketController[];
  totalBytes: number;
  totalFiles: number;
}

export interface TaonSudoRawMigrationSummary {
  id: string;
  contextName: string;
  name: string;
  createdAt: string;
  totalBytes: number;
  totalFiles: number;
}

export interface TaonSudoRawMigrationColumnCompatibility {
  snapshot: TaonSudoRawMigrationColumn;
  current?: TaonSudoRawMigrationColumn;
  status: 'compatible' | 'missing' | 'incompatible';
  reason?: string;
}

export interface TaonSudoRawMigrationEntityCompatibility {
  snapshot: TaonSudoRawMigrationSchemaEntity;
  current?: TaonSudoRawMigrationSchemaEntity;
  status: 'compatible' | 'missing' | 'columns-differ';
  columns: TaonSudoRawMigrationColumnCompatibility[];
}

export interface TaonSudoRawMigrationEntityMapping {
  sourceTableName: string;
  destinationTableName: string | null;
  selected: boolean;
  columns: {
    sourceColumn: string;
    destinationColumn: string | null;
  }[];
}

export interface TaonSudoRawMigrationRestorePlan {
  format: 'taon-sudo-raw-migration-restore-plan';
  version: 1;
  snapshotId: string;
  snapshotSchemaFingerprint: string;
  currentSchemaFingerprint: string;
  clearAllData: boolean;
  entities: TaonSudoRawMigrationEntityMapping[];
  bucketControllers: string[];
}

export interface TaonSudoRawMigrationPlanIssue {
  code:
    | 'INVALID_FORMAT'
    | 'SNAPSHOT_CHANGED'
    | 'CURRENT_SCHEMA_CHANGED'
    | 'UNKNOWN_SOURCE_ENTITY'
    | 'UNKNOWN_DESTINATION_ENTITY'
    | 'DUPLICATE_DESTINATION_ENTITY'
    | 'UNKNOWN_SOURCE_COLUMN'
    | 'UNKNOWN_DESTINATION_COLUMN'
    | 'DUPLICATE_DESTINATION_COLUMN'
    | 'INCOMPATIBLE_COLUMN_TYPE'
    | 'MISSING_REQUIRED_COLUMN'
    | 'MISSING_PRIMARY_KEY'
    | 'UNKNOWN_BUCKET_CONTROLLER'
    | 'FOREIGN_KEY_DEPENDENCY';
  message: string;
  sourceTableName?: string;
  sourceColumn?: string;
  destinationTableName?: string;
  destinationColumn?: string;
}

export interface TaonSudoRawMigrationPlanValidation {
  valid: boolean;
  errors: TaonSudoRawMigrationPlanIssue[];
  warnings: TaonSudoRawMigrationPlanIssue[];
  selectedEntityCount: number;
  selectedBucketControllerCount: number;
}

export interface TaonSudoRawMigrationCompatibilityReport {
  snapshotId: string;
  snapshotSchemaFingerprint: string;
  currentSchemaFingerprint: string;
  snapshotEntities: TaonSudoRawMigrationSchemaEntity[];
  currentEntities: TaonSudoRawMigrationSchemaEntity[];
  entities: TaonSudoRawMigrationEntityCompatibility[];
  newEntities: TaonSudoRawMigrationSchemaEntity[];
  snapshotBucketControllers: string[];
  currentBucketControllers: string[];
  missingBucketControllers: string[];
  newBucketControllers: string[];
  schemasCompatible: boolean;
  suggestedPlan: TaonSudoRawMigrationRestorePlan;
}

export type TaonSudoRawMigrationOperation = 'create' | 'restore';

export interface TaonSudoRawMigrationJob {
  id: string;
  snapshotId: string;
  contextName: string;
  operation: TaonSudoRawMigrationOperation;
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  phase: string;
  completed: number;
  total: number;
  error?: string;
  errorStack?: string;
}

export interface TaonSudoRawMigrationJobUpdate {
  phase: string;
  completed?: number;
  total?: number;
}
