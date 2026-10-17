// services.appData: reset, back up and restore the app's stored data
import type { AppDataService, BackupDatabase, SettingsAdmin } from '@apackdev/sdk/services';
import type { EarsAdmin } from '@apackdev/ears';
import type { LmdbStore } from '@apackdev/ears/lmdb';
import { exportDatabase, readBackupSummary, importDatabase } from '../backup/index.ts';
import { secretsStore } from '../secrets/index.ts';
import { _getMediaPath } from '@apackdev/sdk/utils';
import { getAppVersion } from '@apackdev/sdk/env';
import type { PackRegistry } from '../packs/registry.ts';
import { startPacks } from '../packs/runtime/start.ts';
import { runAppMigrations, runPackMigrations } from '../migrations/index.ts';
import { createSettingsBackupValidator } from '../features/settings/be/backup.ts';

/**
 * `onReplaced` runs after either operation has rebuilt the world, and after a failed one too: a failed import
 * has already cleared the engine and reloaded what it put back. What it does with that is the caller's —
 * replacing the data is this service's job, and telling the app is not.
 */
export function createAppData({ store, engine, registry, settings, onReplaced }: {
  store: LmdbStore; engine: EarsAdmin; registry: PackRegistry; settings: SettingsAdmin; onReplaced: () => void;
}): AppDataService {
  async function reloadMemory(includeVolatile = false): Promise<void> {
    engine.clear();
    await store.hydrate({ includeVolatile });
  }

  async function replaceData<T>(replace: () => Promise<T>): Promise<T> {
    try { return await settings.whileReplacingData(replace); }
    finally { onReplaced(); }
  }

  return {
    // The app as a fresh boot leaves it: the packs stop as when the app exits, the stores empty, then the packs
    // start as a boot starts them (onInit, migrations, content). Their systems keep running.
    async reset() {
      await replaceData(async () => {
        registry.runShutdownHooks();
        engine.clear();
        await store.reset();
        // Stored API keys go too, with their data keys; after the database reopens, since the settings system hears of it
        secretsStore.clearAll();
        startPacks(registry);
      });
    },
    exportBackup: (targetPath, name, databases) =>
      exportDatabase(store, targetPath, { name, databases, mediaPath: _getMediaPath(), appVersion: getAppVersion() }),
    async importBackup(backupPath, options) {
      const entityTypes = registry.getRegisteredEntityTypes();
      const validate = createSettingsBackupValidator(registry.settingsCatalog());
      return importDatabase(store, backupPath, _getMediaPath(), {
        ...options, entityTypes, validate,
        withReplacement: replace => replaceData(async () => {
          try {
            const result = await replace();
            await reloadMemory(result.databases.includes('volatileLmdb'));
            // Run declared versioned data changes after restore, before notifying consumers.
            if (runAppMigrations(registry)) runPackMigrations(registry.packMigrationTargets('pack'));
            return result;
          } catch (error) {
            // A failed file replacement has restored the previous files; reload them.
            await reloadMemory();
            throw error;
          }
        }),
      });
    },
    async readBackupSummary(backupPath) {
      const info = await readBackupSummary(backupPath);
      return info && { ...info, databases: info.databases as BackupDatabase[] };
    },
  };
}
