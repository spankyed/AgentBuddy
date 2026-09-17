// Opening an app's database: the one composition of the LMDB store and the engine, which the API's boot and tools
// (abuddy db) share, so both hydrate a data dir the same way
import { createEarsEngine, installEngine, type EarsAdmin, type EarsEngine, type EarsQuery } from '@abuddy/ears';
import { openLmdbStore, type LmdbPaths, type LmdbStore } from '@abuddy/ears/lmdb';
import { resolveAppContext, type AppEnv } from '@abuddy/sdk/env';
import type { AppDataPaths } from '@abuddy/sdk/utils';
import { findAppDataPaths } from './layout.ts';
import { readInstalledSchema, type DatabaseSchema, type InstalledSchema } from './schema.ts';

export interface DatabaseStoreOptions {
  /** Each partition's database directory */
  paths: LmdbPaths;
  /** The entity types and partition policy: the app's registered packs, or the installed packs' manifests */
  schema: DatabaseSchema;
  readOnly?: boolean;
  /** Where the store's progress lines go; `console.log` by default */
  log?: (message: string) => void;
}

/**
 * The LMDB store at `paths` and a new engine persisting to it, which checks entity types against `schema`. Nothing is
 * hydrated or installed: the caller hydrates (`store.hydrate()`) once `schema` holds every entity type.
 */
export function openDatabaseStore({ paths, schema, readOnly, log }: DatabaseStoreOptions): { store: LmdbStore; engine: EarsEngine } {
  const store = openLmdbStore({ paths, policy: schema.partitionPolicy, engine: () => engine.admin, readOnly, log });
  const engine = createEarsEngine({ persistence: store.sink, isEntityType: (name) => schema.getRegisteredEntityTypes().has(name) });
  return { store, engine };
}

/** An app's database opened outside the app */
export interface AppDatabase {
  userDataDir: string;
  /** The data dir's stores */
  paths: AppDataPaths;
  /** The installed packs' entity types, relation kinds and partition policy */
  schema: InstalledSchema;
  store: LmdbStore;
  query: EarsQuery;
  admin: EarsAdmin;
  /**
   * Flushes the writes made through the engine and closes the store, uninstalling the engine. Throws when a write
   * failed to reach the files, in this call's flush or earlier.
   */
  close(): void;
}

export interface OpenAppDatabaseOptions {
  /** The data dir's environment (production, beta, development or test), which names its app */
  env: AppEnv;
  userDataDir: string;
  /** Opens the files without writing to them: writes through the engine throw */
  readOnly?: boolean;
  /** Where the store's progress lines go; `console.log` by default */
  log?: (message: string) => void;
}

/**
 * Opens the database in `userDataDir` as the app does: the installed packs' schema (their manifests; no pack code
 * runs), the store in the layout the data dir uses, and the primary partition hydrated. The engine's query face is
 * installed, so `@abuddy/ears`'s free functions act on it until `close()`.
 */
export async function openAppDatabase({ env, userDataDir, readOnly = false, log }: OpenAppDatabaseOptions): Promise<AppDatabase> {
  const context = resolveAppContext({ env, userDataDir });
  const paths = findAppDataPaths(userDataDir);
  const schema = readInstalledSchema(context);
  const { store, engine } = openDatabaseStore({
    paths: { primary: paths.lmdb, volatileBackup: paths.volatileLmdb },
    schema,
    readOnly,
    log,
  });
  try {
    installEngine(engine.query);
    await store.hydrate();
  } catch (error) {
    installEngine(undefined);
    store.close();
    throw error;
  }

  return {
    userDataDir,
    paths,
    schema,
    store,
    query: engine.query,
    admin: engine.admin,
    close() {
      installEngine(undefined);
      const { errorCount, lastError } = store.close();
      if (errorCount > 0) {
        const cause = (lastError as { error?: unknown } | null)?.error ?? lastError;
        throw new Error(`${errorCount} write(s) didn't reach the database in ${userDataDir}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
      }
    },
  };
}
