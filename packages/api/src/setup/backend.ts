import { createActor } from 'xstate';
import { createLogger, reportError } from '@abuddy/sdk/logger';
import { bindHost } from '@abuddy/sdk/runtime';
import { bus } from '@abuddy/sdk/ids';
import { getLmdbPath, getVolatileLmdbPath } from '@abuddy/sdk/utils';
import type { EarsEngine } from '@abuddy/ears';
import type { LmdbStore } from '@abuddy/ears/lmdb';
import { assertNoDatabaseWriter, openDatabaseStore } from '@abuddy/host/database';
import { createPackRegistry, discoverBuiltInPacks, publishHostPackOutput, pruneHostPackOutputs, prepareHostDataDirs, type PackRegistry } from '@abuddy/host/packs';
import { resolveAppContext } from '@abuddy/sdk/env';
import * as path from 'path';
import {
  createPacksSystem, packsEvents,
  loadBuiltInPacks, getBuiltInPackInfos,
  loadExternalPacks, registerExternalPacks,
  startPacks, setLoadedPacks,
} from '@abuddy/host/packs/runtime';
import { createAppBus } from '@abuddy/host/bus';
import { createHostRuntime } from '@abuddy/host/services';
import { forwardSecretsChanges } from '@abuddy/host/secrets';
import { assertSourceResolution } from '@abuddy/host/build/source-resolution';
import { rootEvents } from '@/core/router/bus-emitter';
import { initializeLogCapture, printLogEvents } from '@/core/shared/debug/log-capture';
import { createRequire } from 'module';
import pkg from '../../../../package.json';

/** The app's version: the root package.json's */
const APP_VERSION: string = pkg.version;

const logger = createLogger('backend');

/** An actor observer that reports the actor's error as fatal, and tells Electron main (a `__fatal` JSON line on stderr) */
function logErrors(actor: string) {
  return {
    error: (error: unknown) => {
      logger.error(`${actor} State Error:`, { error });
      reportError({ error, title: 'Something went wrong', source: actor, severity: 'fatal' });
      const err = error instanceof Error ? error : new Error(String(error));
      process.stderr.write(JSON.stringify({ __fatal: true, message: err.message, stack: err.stack, source: actor }) + '\n');
    },
  };
}

/** The app's data: its LMDB store, the engine that persists to it (both faces: the composition keeps `admin`), and its registered packs */
export interface AppStore {
  store: LmdbStore;
  engine: EarsEngine;
  packs: PackRegistry;
}

/** The app's registered packs, which openAppStore creates: the transport's procedures and dev reload work on them */
export let appPacks: PackRegistry;

/**
 * Opens the app's data and binds the app: the registered packs (`createPackRegistry()`, empty until the caller
 * registers them), the LMDB store and the app's engine persisting to it (`openDatabaseStore`, `@abuddy/host/database`,
 * which `abuddy db` opens a data dir with too) with their partition policy and entity types, and
 * `bindHost(createHostRuntime(...))` with the root event bus, whose log events are printed, the app version, the
 * registry (the SDK's lookups read it), the engine (packs get its query face, installed by the bind) and the host
 * services over the store and the engine's admin face. The caller hydrates the store once the packs are registered.
 */
export function openAppStore(): AppStore {
  const packs = createPackRegistry();
  const { store, engine } = openDatabaseStore({
    paths: { primary: getLmdbPath(), volatileBackup: getVolatileLmdbPath() },
    schema: packs,
  });
  bindHost(createHostRuntime({ store, engine, transport: { rootEvents }, appVersion: APP_VERSION, packs }));
  printLogEvents();
  appPacks = packs;
  return { store, engine, packs };
}

// Exported for graceful shutdown (SIGTERM handler stops the actor system)
export let backendActor: ReturnType<typeof createActor<ReturnType<typeof createAppBus>>>;

export async function setupBackend(): Promise<void> {
  initializeLogCapture();

  // Before anything opens the database: a tool changing it (`abuddy db`) holds a lock until it's done, and opening
  // now would overwrite its change from this process's memory
  const appContext = resolveAppContext();
  assertNoDatabaseWriter(appContext.userDataDir);

  // The app's data: the engine persists to it from here on, and it's hydrated once the packs are registered
  const { store, packs } = openAppStore();

  // Packs require workspace @abuddy/* packages at runtime: from a checkout they must get source,
  // not a stale dist (main starts the API with the condition; manual boots must pass it). The
  // packaged app runs the API on Electron's runtime and ships no workspace source.
  if (!process.versions.electron) {
    assertSourceResolution(createRequire(import.meta.url).resolve, 'The API server');
  }

  // ── Register host-level systems (before any pack loading) ──────────
  packs.registerHostSystem('packs', createPacksSystem(packs), packsEvents);

  // Before discovery: a pack an interrupted install left only as its moved-aside copy is restored,
  // and abuddy install learns which AgentBuddy uses this data dir
  prepareHostDataDirs({ userDataDir: appContext.userDataDir, packsDirs: [appContext.packsDir, appContext.hostPacksDir], version: APP_VERSION });

  // API keys: the settings system hears of every change to them
  forwardSecretsChanges(packs);

  // ── Load packs (built-in async + external sync overlap) ────────────
  const builtInDir = process.env.BUILT_IN_PACKS_DIR;
  const builtInPromise = builtInDir
    ? loadBuiltInPacks(packs, builtInDir, { bundledLoaders: () => import('virtual:built-in-pack-loaders').then(m => m.default) })
    : null;

  // External pack work is sync — runs while built-in loading is in flight
  let externalPacks = loadExternalPacks();
  if (externalPacks.length > 0) {
    externalPacks = registerExternalPacks(packs, externalPacks);
  }

  if (builtInPromise) {
    // Pack authors resolve built-in dependencies (types, step build code) from the installed app
    const builtInInfos = await builtInPromise;
    for (const info of builtInInfos) {
      try {
        if (publishHostPackOutput(info.dir, path.join(appContext.hostPacksDir, info.id))) {
          console.log(`[packs] Published build output for built-in pack ${info.id}`);
        }
      } catch (err) {
        console.warn(`[packs] Could not publish build output for ${info.id}:`, err);
      }
    }
    // A pack this release no longer has leaves its build output behind, which tools would still read as the app's.
    // Kept by what this build ships, not by what loaded: a pack whose runtime failed this boot still has its own.
    const stale = pruneHostPackOutputs(appContext.hostPacksDir, discoverBuiltInPacks(builtInDir!).map((pack) => pack.id));
    if (stale.length > 0) console.log(`[packs] Removed build output of built-in pack(s) this app no longer has: ${stale.join(', ')}`);
  }

  // Run early boot hooks (logs system must start before anything else)
  for (const hooks of packs.getBootHooks()) {
    if (hooks.earlySystem) {
      const logsActor = createActor(hooks.earlySystem).start();
      logsActor.subscribe(logErrors('Logs'));
    }
  }

  console.log(`[app] AgentBuddy v${APP_VERSION} startupId=${process.env.AGENTBUDDY_STARTUP_ID ?? 'unknown'}`);

  // ── Wire shutdown hooks (keyed by pack ID for scoped reload teardown) ──
  for (const info of getBuiltInPackInfos()) {
    const hooks = packs.getPackBootHooks(info.id);
    if (hooks?.onShutdown) {
      packs.registerShutdownHook(hooks.onShutdown, info.id);
    }
  }
  for (const pack of externalPacks) {
    if (pack.boot?.onShutdown) {
      packs.registerShutdownHook(pack.boot.onShutdown, pack.manifest.id);
    }
  }

  // ── Hydrate (policy now sees all entity types from all packs)
  await store.hydrate();

  // ── Start the packs: each one's onInit, the migrations (the app's, then external packs'), the seeds
  setLoadedPacks(externalPacks);
  startPacks(packs, externalPacks);

  // ── Start backend actor ──────────────────────────────────────────────
  backendActor = createActor(createAppBus(packs), {
    systemId: bus,
  }).start();

  backendActor.subscribe(logErrors('Backend'));
}
