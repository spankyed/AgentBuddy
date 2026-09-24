import { createActor } from 'xstate';
import { createLogger, reportError } from '@abuddy/sdk/logger';
import { bindHost } from '@abuddy/sdk/runtime';
import { _getLmdbPath, _getVolatileLmdbPath } from '@abuddy/sdk/utils';
import type { EarsEngine } from '@abuddy/ears';
import type { LmdbStore } from '@abuddy/ears/lmdb';
import { assertNoDatabaseWriter, openDatabaseStore } from '@abuddy/host/database';
import { createPackRegistry, discoverBuiltInPacks, publishHostPackOutput, pruneHostPackOutputs, prepareHostDataDirs, type PackRegistry } from '@abuddy/host/packs';
import { resolveAppContext } from '@abuddy/sdk/env';
import * as path from 'path';
import { loadAppPacks, startPacks } from '@abuddy/host/packs/runtime';
// The app's own features: its registration, and the systems it runs for them
import {
  APPLICATION_SYSTEM_EVENTS, createApplicationSystem, createPacksSystem, createSettingsSystem, hostRegistration, packsEvents, settingsEvents,
} from '@abuddy/host/features';
import { createAppBus, HOST, startEarlySystems } from '@abuddy/host/bus';
import { createHostRuntime } from '@abuddy/host/services';
import { forwardSecretsChanges } from '@abuddy/host/secrets';
import { assertSourceResolution } from '@abuddy/host/build/source-resolution';
import { rootEvents } from '@/transport/emitter';
import { initializeLogCapture, printLogEvents } from '@/adapters/logging';
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
  // Installed packs that aren't running keep their settings: the settings take writes for their features too
  const packs = createPackRegistry({ installedPacksDir: () => resolveAppContext().packsDir });
  const { store, engine } = openDatabaseStore({
    paths: { primary: _getLmdbPath(), volatileBackup: _getVolatileLmdbPath() },
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

  // ── The app's own features, as the pack `host` (before any pack loading) ──────────
  packs.registerPack(hostRegistration({
    // The app shell's own state (which tabs show, the last plugin open), which the application plugin reads
    application: { machine: createApplicationSystem(packs), receives: APPLICATION_SYSTEM_EVENTS },
    packs: { machine: createPacksSystem(packs), receives: [...packsEvents] },
    // The app's settings: one row, one writer, and what every feature reads its own from
    settings: { machine: createSettingsSystem(), receives: [...settingsEvents] },
  }));

  // Before discovery: a pack an interrupted install left only as its moved-aside copy is restored,
  // and abuddy install learns which AgentBuddy uses this data dir
  prepareHostDataDirs({ userDataDir: appContext.userDataDir, packsDir: appContext.packsDir, hostPacksDir: appContext.hostPacksDir, version: APP_VERSION });

  // API keys: the settings system hears of every change to them
  forwardSecretsChanges(packs);

  // ── Load packs (every built-in pack registers before any external one) ────────────
  const builtInDir = process.env.BUILT_IN_PACKS_DIR;
  const { builtIn: builtInInfos, external: externalPacks } = await loadAppPacks(packs, {
    builtInDir,
    bundledLoaders: () => import('virtual:built-in-pack-loaders').then(m => m.default),
  });

  if (builtInDir) {
    // Pack authors resolve built-in dependencies (types, step build code) from the installed app
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
    const stale = pruneHostPackOutputs(appContext.hostPacksDir, discoverBuiltInPacks(builtInDir).map((pack) => pack.id));
    if (stale.length > 0) console.log(`[packs] Removed build output of built-in pack(s) this app no longer has: ${stale.join(', ')}`);
  }

  // Start the early systems (the logs system must start before anything else)
  const early = startEarlySystems(packs);
  for (const { id, actor } of early.actors) actor.subscribe(logErrors(id));

  console.log(`[app] AgentBuddy v${APP_VERSION} startupId=${process.env.AGENTBUDDY_STARTUP_ID ?? 'unknown'}`);

  // ── Wire shutdown hooks (keyed by pack ID for scoped reload teardown) ──
  for (const info of packs.builtInPacks()) {
    const hooks = packs.getPackRegistration(info.id)?.boot;
    if (hooks?.onShutdown) {
      packs.registerShutdownHook(hooks.onShutdown, info.id);
    }
  }
  for (const pack of externalPacks) {
    if (pack.registration.boot?.onShutdown) {
      packs.registerShutdownHook(pack.registration.boot.onShutdown, pack.origin.id);
    }
  }

  // ── Hydrate (policy now sees all entity types from all packs)
  await store.hydrate();

  // ── Start the packs: each one's onInit, the migrations (the app's, then external packs'), the seeds
  startPacks(packs);

  // ── Start backend actor ──────────────────────────────────────────────
  backendActor = createActor(createAppBus(packs, early), {
    systemId: HOST.bus,
  }).start();

  backendActor.subscribe(logErrors('Backend'));
}
