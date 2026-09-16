// services.appData: reset, back up and restore the app's stored data
import type { AppDataService, BackupDatabase } from '@abuddy/sdk/services';
import { clearMemory, envs, hydrateSharded, persistence, policy, resetLmdbFiles } from '../ears/index.ts';
import { exportDatabase, getBackupInfo, importDatabase } from '../backup/index.ts';

async function reloadMemory(includeVolatile = false): Promise<void> {
  clearMemory();
  await hydrateSharded({ envs, policy, includeVolatile, shardedPersistence: persistence });
}

export const appData: AppDataService = {
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
