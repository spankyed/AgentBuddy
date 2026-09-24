// Opening an app's database: the one composition of the LMDB store and the engine, which the API's boot and tools
// (abuddy db) share, so both hydrate a data dir the same way
import { createEarsEngine, installEngine, type EarsAdmin, type EarsEngine, type EarsQuery } from '@abuddy/ears';
import { openLmdbStore, type LmdbPaths, type LmdbStore } from '@abuddy/ears/lmdb';
import { resolveAppContext, type AppEnv } from '@abuddy/sdk/env';
import type { _AppDataPaths } from '@abuddy/sdk/utils';
import { findAppDataPaths } from './layout.ts';
import { readInstalledSchema, type DatabaseSchema, type InstalledSchema } from './schema.ts';
import { errorMessage } from '@abuddy/sdk/utils/pure';

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
  paths: _AppDataPaths;
  /** The installed packs' entity types, relation kinds and partition policy */
  schema: InstalledSchema;
  store: LmdbStore;
  query: EarsQuery;
  admin: EarsAdmin;
  /**
   * Flushes the writes made through the engine and closes the store, putting back the engine that was installed
   * before this one. Throws when a write failed to reach the files, in this call's flush or earlier.
   */
  close(): void;
}

export interface OpenAppDatabaseOptions {
  /** The data dir's environment (production, beta, development or test), which names its app */
  env: AppEnv;
  userDataDir: string;
  /** Opens the files without writing to them: writes through the engine throw */
  readOnly?: boolean;
  /**
   * Loads the volatile partition (the run history) too. The app leaves it out, reading it directly instead, so a
   * tool that wants those rows in its queries asks for them.
   */
  includeVolatile?: boolean;
  /** Where the store's progress lines go; `console.log` by default */
  log?: (message: string) => void;
}

/**
 * Opens the database in `userDataDir` as the app does: the installed packs' schema (their manifests; no pack code
 * runs), the store in the layout the data dir uses, and the primary partition hydrated. The engine's query face is
 * installed, so `@abuddy/ears`'s free functions act on it until `close()`. The volatile partition (the run history)
 * is left out, as in the app, unless `includeVolatile` asks for it.
 */
export async function openAppDatabase({ env, userDataDir, readOnly = false, includeVolatile = false, log }: OpenAppDatabaseOptions): Promise<AppDatabase> {
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
    // Hydration fills the engine it was given, not the installed one, so nothing is installed until it succeeds:
    // an open that fails leaves this process's engine exactly as it was
    await store.hydrate({ includeVolatile });
  } catch (error) {
    store.close();
    throw error;
  }
  // Installed so `@abuddy/ears`'s free functions (qx, tx, the finders) read this database until `close()`, which
  // puts back whatever was installed before rather than leaving none. `abuddy db`, the one caller today, has no
  // engine of its own, so it gets none back; what this is for is a caller that does — a test file, or a command
  // holding one data dir open while it reads another, where uninstalling would leave the first unreachable.
  const previousEngine = installEngine(engine.query);

  return {
    userDataDir,
    paths,
    schema,
    store,
    query: engine.query,
    admin: engine.admin,
    close() {
      installEngine(previousEngine);
      const { errorCount, lastError } = store.close();
      if (errorCount > 0) {
        const cause = (lastError as { error?: unknown } | null)?.error ?? lastError;
        throw new Error(`${errorCount} write(s) didn't reach the database in ${userDataDir}: ${errorMessage(cause)}`, { cause });
      }
    },
  };
}
