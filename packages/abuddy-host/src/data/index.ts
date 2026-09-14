// The host's implementations of the SDK's appData and traceStore services. The api registers them
// as host modules at boot; packs reach them through `services.appData` and `services.traceStore`.
import type { AppDataService, BackupDatabase, TraceStore, TraceEntityMeta, TraceRelation } from '@abuddy/sdk/services';
import type { EARS } from '@abuddy/sdk';
import { getHostModule } from '@abuddy/sdk/runtime';
import { clearMemory, envs, hydrateSharded, persistence, policy, resetLmdbFiles } from '../ears/index.ts';
import { exportDatabase, getBackupInfo, importDatabase } from '../backup/index.ts';

async function reloadMemory(includeVolatile = false): Promise<void> {
  clearMemory();
  await hydrateSharded({ envs, policy, includeVolatile, shardedPersistence: persistence });
}

export const appDataModule: AppDataService = {
  reset: () => resetLmdbFiles(),
  exportBackup: (targetPath, name, databases) => exportDatabase(targetPath, name, databases),
  async importBackup(backupPath) {
    try {
      const result = await importDatabase(backupPath);
      const databases = result.databases as BackupDatabase[];
      await reloadMemory(databases.includes('volatileLmdb'));
      return { databases };
    } catch (error) {
      // importDatabase has put the previous files back; reload them
      await reloadMemory();
      throw error;
    }
  },
  async backupInfo(backupPath) {
    const info = await getBackupInfo(backupPath);
    return info && { ...info, databases: info.databases as BackupDatabase[] };
  },
};

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

export const traceStoreModule: TraceStore = {
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
