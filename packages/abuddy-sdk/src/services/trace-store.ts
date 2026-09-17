import type { EARS } from '../types/entities.ts';

/** An entity row's bookkeeping in the trace store */
export interface TraceEntityMeta {
  type: string;
  createdAt: number;
  deletedAt?: number;
}

export interface TraceRelation {
  kind: string;
  src: EARS.EntityId;
  tgt: EARS.EntityId;
  info?: unknown;
  createdAt: number;
}

/** Read-only access to the volatile trace store: flow execution records (TNodes), kept out of the in-memory database */
export interface TraceStore {
  /** Every entity in the store, with its bookkeeping */
  entities(): Array<{ id: EARS.EntityId; meta: TraceEntityMeta }>;
  getEntityMeta(id: EARS.EntityId): TraceEntityMeta | null;
  /** The attribute's first value, or undefined */
  getAttr(kind: string, id: EARS.EntityId): unknown;
  /** Relations matching the filter; relations to deleted entities are skipped unless `skipDeleted` is false */
  relations(filter?: { kind?: string; src?: EARS.EntityId; tgt?: EARS.EntityId; skipDeleted?: boolean; limit?: number }): Array<{ id: string; rel: TraceRelation }>;
}
