/**
 * Base interface for persistence sinks.
 * Any storage backend (LMDB, SQLite, etc.) can implement this interface.
 */
export interface PersistenceSink {
  onCreateEntity(entityId: string, entityType?: string): void;
  onDestroyEntity(entityId: string): void;

  onPutAttr(kind: string, entityId: string, idx: number, value: unknown, entireArray?: unknown[]): void;
  onDropAttr(kind: string, entityId: string, idx: number, entireArray?: unknown[]): void;
  
  /** Rewrite the whole array for (kind, entityId) to keep indices consistent. */
  onPutAttrArray?(kind: string, entityId: string, values: unknown[]): void;

  onAddRelation(relId: string, kind: string, src: string, tgt: string, info: unknown): void;
  onUpdateRelation(relId: string, patch: { src?: string; tgt?: string; info?: unknown }): void;
  onRemoveRelation(relId: string): void;

  /** Optional: flush pending operations and close on shutdown */
  close?(): void;
  
  /** Optional: get error statistics for monitoring */
  getErrorStats?(): { errorCount: number; lastError: any };
}