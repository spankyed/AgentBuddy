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
   * Replaces everything the app holds, and tells the running systems once the new world is built.
   *
   * **One owner for "the stored data was replaced", rather than a reminder at each call site.** A system's
   * state is what it last published, so wiping the rows underneath it leaves every plugin rendering a
   * database that no longer exists — which is what reset and import both did, each announcing only to the
   * Database plugin. Whoever replaces the data next gets the announcement by going through here.
   *
   * **After `rebuild`, never before.** The packs' `onInit`, migrations and seeds have to have run, or every
   * system faithfully republishes the empty database it was asked about.
   *
   * It sends through the bus it was given rather than the bound one, so what this service needs is in its
   * signature and a caller assembling a runtime does not also have to have bound it.
   */
  async function replacingData<T>(rebuild: () => Promise<T> | T): Promise<T> {
    try {
      return await rebuild();
    } finally {
      // `finally`, because the rows are gone either way: a failed import has already cleared the engine and
      // reloaded the files it put back, so the systems are describing a database that was rebuilt underneath
      // them whether or not the operation they were asked for succeeded
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
