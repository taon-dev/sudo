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
