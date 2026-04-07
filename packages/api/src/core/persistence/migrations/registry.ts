import type { LmdbDbs } from '../lmdb/envs';

export interface Migration {
  version: number;
  description: string;
  up(dbs: LmdbDbs): void;
  /** Runs after hydrateSharded() completes — use for cache invalidation, re-indexing, etc. */
  postHydrate?(): void;
}

/**
 * Ordered list of migrations. Each runs inside a transactionSync.
 * Migrations operate on raw LMDB keys ({t, v} encoded format),
 * NOT the in-memory EARS layer (which is not yet hydrated).
 */
export const migrations: Migration[] = [
  // Example migration:
  // {
  //   version: 1,
  //   description: 'Rename AttrKind.Label to AttrKind.DisplayName',
  //   up(dbs) {
  //     const SEP = '\x1F';
  //     for (const { key, value } of dbs.attrs.getRange()) {
  //       const k = String(key);
  //       if (k.startsWith(`label${SEP}`)) {
  //         const newKey = k.replace(`label${SEP}`, `displayName${SEP}`);
  //         dbs.attrs.putSync(newKey, value);
  //         dbs.attrs.removeSync(k);
  //       }
  //     }
  //   },
  // },
];
