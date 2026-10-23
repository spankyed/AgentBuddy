// services.traceStore: read-only access to the volatile trace store (flow execution records)
import type { TraceStore, TraceEntityMeta, TraceRelation } from '@apackdev/sdk/services';
import type { EARS } from '@apackdev/sdk';
import type { LmdbStore, RelationRecord as StoredRelation } from '@apackdev/ears/lmdb';

export function createTraceStore(store: LmdbStore): TraceStore {
  // Over the current volatile env (reopened after a reset or import)
  const traceQuery = () => store.read('volatileBackup');
  return {
    entities() {
      const rows = store.envs.volatileBackup.entities.getRange() as Iterable<{ key: string; value: TraceEntityMeta }>;
      return Array.from(rows, ({ key, value }) => ({ id: key as EARS.EntityId, meta: value }));
    },
    getEntityMeta: (id) => traceQuery().getEntityMeta(id) as TraceEntityMeta | null,
    getAttr: (id, kind) => traceQuery().getAttr(id, kind),
    // The stored row names its ends src and tgt, the files' format; the store answers in the one relation shape
    relations({ kind, source, target, limit } = {}) {
      const rows = traceQuery().relations({ kind, src: source, tgt: target, limit }) as Iterable<{ relId: string; rel: StoredRelation }>;
      return Array.from(rows, ({ relId, rel: { kind, src, tgt, info, createdAt } }): TraceRelation =>
        ({ id: relId as EARS.EntityId, kind, source: src as EARS.EntityId, target: tgt as EARS.EntityId, ...(info !== undefined && { info }), createdAt }));
    },
  };
}
