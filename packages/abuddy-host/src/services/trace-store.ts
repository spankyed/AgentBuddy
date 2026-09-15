// services.traceStore: read-only access to the volatile trace store (flow execution records)
import type { TraceStore, TraceEntityMeta, TraceRelation } from '@abuddy/sdk/services';
import type { EARS } from '@abuddy/sdk';
import { getHostModule } from '@abuddy/sdk/runtime';
import { envs } from '../ears/index.ts';

interface LmdbQueryLike {
  getEntityMeta(id: string): unknown;
  getAttr(kind: string, id: string): unknown;
  relations(filter?: { kind?: string; src?: string; tgt?: string; skipDeleted?: boolean; limit?: number }): Iterable<{ relId: string; rel: unknown }>;
}

// The api's LmdbQuery class, over the current volatile env (reopened after a reset or import)
const traceQuery = (): LmdbQueryLike => {
  const { LmdbQuery } = getHostModule<{ LmdbQuery: new (dbs: unknown) => LmdbQueryLike }>('lmdb-query');
  return new LmdbQuery(envs.volatileBackup);
};

export const traceStore: TraceStore = {
  entities() {
    const rows = envs.volatileBackup.entities.getRange() as Iterable<{ key: string; value: TraceEntityMeta }>;
    return Array.from(rows, ({ key, value }) => ({ id: key as EARS.EntityId, meta: value }));
  },
  getEntityMeta: (id) => traceQuery().getEntityMeta(id) as TraceEntityMeta | null,
  getAttr: (kind, id) => traceQuery().getAttr(kind, id),
  relations(filter) {
    const rows = traceQuery().relations(filter) as Iterable<{ relId: string; rel: TraceRelation }>;
    return Array.from(rows, ({ relId, rel }) => ({ id: relId, rel }));
  },
};
