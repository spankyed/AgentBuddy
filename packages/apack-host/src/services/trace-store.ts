// services.traceStore: read-only access to the volatile trace store (flow execution records)
import type { TraceStore, TraceEntityMeta, TraceRelation } from '@apackdev/sdk/services';
import type { EARS } from '@apackdev/sdk';
import type { LmdbStore } from '@apackdev/ears/lmdb';

export function createTraceStore(store: LmdbStore): TraceStore {
  // Over the current volatile env (reopened after a reset or import)
  const traceQuery = () => store.query('volatileBackup');
  return {
    entities() {
      const rows = store.envs.volatileBackup.entities.getRange() as Iterable<{ key: string; value: TraceEntityMeta }>;
      return Array.from(rows, ({ key, value }) => ({ id: key as EARS.EntityId, meta: value }));
    },
    getEntityMeta: (id) => traceQuery().getEntityMeta(id) as TraceEntityMeta | null,
    getAttr: (kind, id) => traceQuery().getAttr(kind, id),
    relations(filter) {
      const rows = traceQuery().relations(filter) as Iterable<{ relId: string; rel: TraceRelation }>;
      return Array.from(rows, ({ relId, rel }) => ({ id: relId, rel }));
    },
  };
}
