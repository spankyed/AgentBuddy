import type { EARS } from '../types/entities.ts';

/** An entity row's bookkeeping in the trace store */
export interface TraceEntityMeta {
  type: string;
  createdAt: number;
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
  /** The entity's attribute value as stored, or undefined when it holds none */
  getAttr(id: EARS.EntityId, kind: string): unknown;
  /** Relations matching the filter */
  relations(filter?: { kind?: string; src?: EARS.EntityId; tgt?: EARS.EntityId; limit?: number }): Array<{ id: string; rel: TraceRelation }>;
}
