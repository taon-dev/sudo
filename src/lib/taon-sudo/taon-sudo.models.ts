export namespace TaonSudoModels {
  export interface BasicContextData {
    contextName: string;
    frontendUriOrigin: string;
    backendUrlOrigin: string;
  }

  export interface SqlColumn {
    name: string;
    propertyName: string;
    type: string;
    primary: boolean;
    generated: boolean;
    nullable: boolean;
  }

  export interface SqlTable {
    name: string;
    tableName: string;
    columns: SqlColumn[];
    primaryColumns: string[];
    /**
     * Table discovered directly from the database (no TypeORM entity).
     */
    raw?: boolean;
    /**
     * When set, edit/delete row operations are disabled for this table.
     */
    rowOperationsDisabledReason?: string;
    /**
     * Operational table (e.g. migrations metadata) - changes need extra care.
     */
    sensitive?: boolean;
  }

  /**
   * Result of one batch of a clear operation (bucket, KV).
   * Clients call the endpoint again until done === true.
   */
  export interface ClearBatchResult {
    deleted: number;
    failed: number;
    done: boolean;
    cursor?: string;
  }
}
