// services.appData: reset, back up and restore the app's stored data, and the user's onboarding (AppState)
import type { AppDataService, BackupDatabase } from '@abuddy/sdk/services';
import type { EarsAdmin } from '@abuddy/ears';
import type { LmdbStore } from '@abuddy/ears/lmdb';
import { exportDatabase, getBackupInfo, importDatabase } from '../backup/index.ts';
import { secretsStore } from '../secrets/index.ts';
import { _getMediaPath } from '@abuddy/sdk/utils';
import { getAppVersion } from '@abuddy/sdk/env';
import type { PackRegistry } from '../packs/registry.ts';
import { startPacks } from '../packs/runtime/start.ts';
import { runAppMigrations, runPackMigrations } from '../migrations/index.ts';
import { appState } from '../app-state/index.ts';
import type { RootEvents } from '@abuddy/sdk/runtime';
import { HOST } from '../refs.ts';

export function createAppData(store: LmdbStore, engine: EarsAdmin, registry: PackRegistry, rootEvents: RootEvents): AppDataService {
  async function reloadMemory(includeVolatile = false): Promise<void> {
    engine.clear();
    await store.hydrate({ includeVolatile });
  }

  /**
   * Both of these replace every row, so the systems still describing the old ones are told — once `rebuild`
   * has run, or they would republish the empty database. Here rather than at each call site, so the next
   * operation that replaces the data cannot forget.
   */
  async function replacingData<T>(rebuild: () => Promise<T>): Promise<T> {
    try {
      return await rebuild();
    } finally {
      // Also on failure: a failed import has already cleared the engine and reloaded what it put back
      rootEvents.emitIncoming({ to: HOST.bus, event: { type: 'DATA_REPLACED' } });
    }
  }

  return {
    // The app as a fresh boot leaves it: the packs stop as when the app exits, the stores empty, then the packs
    // start as a boot starts them (onInit, migrations, seeds). Their systems keep running.
    reset: () => replacingData(async () => {
      registry.runShutdownHooks();
      engine.clear();
      await store.reset();
      // Stored API keys go too, with their data keys; after the database reopens, since the settings system hears of it
      secretsStore.clearAll();
      startPacks(registry);
    }),
    hasOnboarded: () => appState.get().hasOnboarded,
    completeOnboarding: () => appState.update({ hasOnboarded: true }),
    exportBackup: (targetPath, name, databases) =>
      exportDatabase(store, targetPath, { name, databases, mediaPath: _getMediaPath(), appVersion: getAppVersion() }),
    importBackup: (backupPath, options) => replacingData(async () => {
      try {
        // The installed packs' types, so a backup holding rows of a type none of them declares is reported
        const result = await importDatabase(store, backupPath, _getMediaPath(), { ...options, entityTypes: registry.getRegisteredEntityTypes() });
        const databases = result.databases as BackupDatabase[];
        await reloadMemory(databases.includes('volatileLmdb'));
        // A backup from an earlier version is migrated now, not at the next boot (one from before AppState keeps
        // the app's state in its settings)
        if (runAppMigrations(registry)) runPackMigrations(registry.externalPackTargets());
        return { databases, missingDatabases: result.missingDatabases as BackupDatabase[], unknownEntityTypes: result.unknownEntityTypes };
      } catch (error) {
        // importDatabase has put the previous files back; reload them. The announcement still goes out —
        // what the systems hold is from before this attempt and the rows underneath them have moved twice
        await reloadMemory();
        throw error;
      }
    }),
    async backupInfo(backupPath) {
      const info = await getBackupInfo(backupPath);
      return info && { ...info, databases: info.databases as BackupDatabase[] };
    },
  };
}
