// Opening an app's database: the one composition of the LMDB store and the engine, which the API's boot and tools
// (abuddy db) share, so both hydrate a data dir the same way
import { createEarsEngine, installEngine, type EarsAdmin, type EarsEngine, type EarsQuery, type EARS } from '@abuddy/ears';
import { openLmdbStore, type LmdbPaths, type LmdbStore } from '@abuddy/ears/lmdb';
import { resolveAppContext, type AppEnv } from '@abuddy/sdk/env';
import type { AppDataPaths } from '@abuddy/sdk/utils';
import { APP_STATE_ENTITY } from '../app-state/index.ts';
import { readHostVersion } from '../packs/host-info.ts';
import { findAppDataPaths } from './layout.ts';
import { readInstalledSchema, type DatabaseSchema, type InstalledSchema } from './schema.ts';
import { checkDataVersion } from './version.ts';

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
  /** The app version the data was last migrated to (`AppState.version`), or else the one that last ran on it */
  dataVersion?: string;
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
  /**
   * The AgentBuddy version the caller was built for: data migrated by a version with another major or minor version
   * is refused (`DataVersionMismatchError`). No check without it.
   */
  supportedVersion?: string;
  /** Where the store's progress lines go; `console.log` by default */
  log?: (message: string) => void;
}

/** The data's recorded app version, read from the hydrated engine */
function storedAppVersion(query: EarsQuery): string | undefined {
  const version = query.getAttr(`${APP_STATE_ENTITY}-app` as EARS.EntityId, 'version');
  return typeof version === 'string' ? version : undefined;
}

/**
 * Opens the database in `userDataDir` as the app does: the installed packs' schema (their manifests; no pack code
 * runs), the store in the layout the data dir uses, and the primary partition hydrated. The engine's query face is
 * installed, so `@abuddy/ears`'s free functions act on it until `close()`.
 */
export async function openAppDatabase({ env, userDataDir, readOnly = false, supportedVersion, log }: OpenAppDatabaseOptions): Promise<AppDatabase> {
  const context = resolveAppContext({ env, userDataDir });
  const paths = findAppDataPaths(userDataDir);
  const schema = readInstalledSchema(context);
  const { store, engine } = openDatabaseStore({
    paths: { primary: paths.lmdb, volatileBackup: paths.volatileLmdb },
    schema,
    readOnly,
    log,
  });
  let failure: unknown;
  try {
    installEngine(engine.query);
    await store.hydrate();
  } catch (error) {
    failure = error;
  }
  const dataVersion = failure === undefined ? storedAppVersion(engine.query) ?? readHostVersion(userDataDir) : undefined;
  if (failure === undefined && supportedVersion) {
    try {
      checkDataVersion(dataVersion, supportedVersion);
    } catch (error) {
      failure = error;
    }
  }
  if (failure !== undefined) {
    installEngine(undefined);
    store.close();
    throw failure;
  }

  return {
    userDataDir,
    paths,
    schema,
    ...(dataVersion !== undefined && { dataVersion }),
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
