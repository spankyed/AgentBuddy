import type { EARS } from '../types/entities.ts';

/** An entity row's bookkeeping in the trace store */
export interface TraceEntityMeta {
  type: string;
  createdAt: number;
}

/** A relation in the run history: `findRelations`' row — its id, kind, ends and info — with when it was stored */
export interface TraceRelation {
  id: EARS.EntityId;
  kind: string;
  source: EARS.EntityId;
  target: EARS.EntityId;
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
  /** Relations matching the filter, as `findRelations` matches */
  relations(filter?: { kind?: string; source?: EARS.EntityId; target?: EARS.EntityId; limit?: number }): TraceRelation[];
}
