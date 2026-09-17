// services.appData: reset, back up and restore the app's stored data, and the user's onboarding (AppState)
import type { AppDataService, BackupDatabase } from '@abuddy/sdk/services';
import type { EarsAdmin } from '@abuddy/ears';
import type { LmdbStore } from '@abuddy/ears/lmdb';
import { exportDatabase, getBackupInfo, importDatabase } from '../backup/index.ts';
import { secretsStore } from '../secrets/index.ts';
import { getMediaPath } from '@abuddy/sdk/utils';
import type { PackRegistry } from '../packs/pack-registration.ts';
import { getLoadedPacks } from '../packs/runtime/loaded-packs.ts';
import { startPacks } from '../packs/runtime/start.ts';
import { runAppMigrations, runPackMigrations } from '../migrations/index.ts';
import { appState } from '../app-state/index.ts';

export function createAppData(store: LmdbStore, engine: EarsAdmin, registry: PackRegistry): AppDataService {
  async function reloadMemory(includeVolatile = false): Promise<void> {
    engine.clear();
    await store.hydrate({ includeVolatile });
  }

  return {
    // The app as a fresh boot leaves it: the packs stop as when the app exits, the stores empty, then the packs
    // start as a boot starts them (onInit, migrations, seeds). Their systems keep running.
    async reset() {
      registry.runShutdownHooks();
      engine.clear();
      await store.reset();
      // Stored API keys go too, with their data keys; after the database reopens, since the settings system hears of it
      secretsStore.clearAll();
      startPacks(registry, getLoadedPacks());
    },
    hasOnboarded: () => appState.get().hasOnboarded,
    completeOnboarding: () => appState.update({ hasOnboarded: true }),
    exportBackup: (targetPath, name, databases) => exportDatabase(store, targetPath, { name, databases, mediaPath: getMediaPath() }),
    async importBackup(backupPath, options) {
      try {
        const result = await importDatabase(store, backupPath, getMediaPath(), options);
        const databases = result.databases as BackupDatabase[];
        await reloadMemory(databases.includes('volatileLmdb'));
        // A backup from an earlier version is migrated now, not at the next boot (one from before AppState keeps
        // the app's state in its settings)
        if (runAppMigrations(registry)) runPackMigrations(getLoadedPacks());
        return { databases, missingDatabases: result.missingDatabases as BackupDatabase[] };
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
}
