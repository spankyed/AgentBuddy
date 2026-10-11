import { createActor } from 'xstate';
import { createLogger, reportError } from '@apack/sdk/logger';
import { bindHost } from '@apack/sdk/runtime';
import { _getLmdbPath, _getVolatileLmdbPath } from '@apack/sdk/utils';
import type { EarsEngine } from '@apack/ears';
import type { LmdbStore, WriteFailure } from '@apack/ears/lmdb';
import { assertNoDatabaseWriter, openDatabaseStore } from '@apack/host/database';
import { createPackRegistry, installShippedPacks, prepareHostDataDirs, type PackRegistry } from '@apack/host/packs';
import { resolveAppContext } from '@apack/sdk/env';
import { PACK_SNAPSHOT_FORMAT } from '@apack/sdk/build';
import { loadAppPacks, startPacks } from '@apack/host/packs/runtime';
// The app's own features: its registration, and the systems it runs for them
import {
  APPLICATION_SYSTEM_EVENTS, createApplicationSystem, createPacksSystem, createSettingsSystem, hostRegistration, packsEvents, settingsEvents,
} from '@apack/host/features';
import { createAppBus, createParticipantClaims, HOST } from '@apack/host/bus';
import { createHostRuntime } from '@apack/host/services';
import { forwardSecretsChanges } from '@apack/host/secrets';
import { assertSourceResolution } from '@apack/host/build/source-resolution';
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
 * The open store, so shutdown can flush it.
 *
 * Nothing closed it until 2026-10-01: shutdown stopped the actor and closed the servers, so the adapter's
 * final flush never ran in production and whatever sat in its buffers at exit was simply gone — along with
 * `errorCount`, which `openAppDatabase().close()` has always known how to report and which no running app
 * ever read.
 */
export let appStore: LmdbStore | undefined;

/**
 * Opens the app's data and binds the app: the registered packs (`createPackRegistry()`, empty until the caller
 * registers them), the LMDB store and the app's engine persisting to it (`openDatabaseStore`, `@apack/host/database`,
 * which `apack db` opens a data dir with too) with their partition policy and entity types, and
 * `bindHost(createHostRuntime(...))` with the root event bus, whose log events are printed, the app version, the
 * registry (the SDK's lookups read it), the engine (packs get its query face, installed by the bind) and the host
 * services over the store and the engine's admin face. The caller hydrates the store once the packs are registered.
 */
/**
 * A write that did not reach the database.
 *
 * Every one is logged with the row it was for, which is what a diagnosis needs and what the old
 * `console.error` never carried. The user is told **once** per process: a production app dropped 3,187
 * writes in one session, and 3,187 toasts would be worse than none — so later drops only move the count,
 * which the message names so a second look says how bad it got.
 */
let droppedWrites = 0;
function reportDroppedWrite({ op, key, error }: WriteFailure): void {
  droppedWrites++;
  logger.error(`A write didn't reach the database (${op} ${key})`, { error, dropped: droppedWrites });
  if (droppedWrites > 1) return;
  reportError({
    error,
    title: `Some changes aren't reaching the database (${op} ${key}). Recent edits may not have been saved.`,
    source: 'database',
  });
}

export function openAppStore(): AppStore {
  // Installed packs that aren't running keep their settings: the settings take writes for their features too
  const packs = createPackRegistry({ installedPacksDir: () => resolveAppContext().packsDir });
  const { store, engine } = openDatabaseStore({
    paths: { primary: _getLmdbPath(), volatileBackup: _getVolatileLmdbPath() },
    schema: packs,
    onWriteFailure: reportDroppedWrite,
  });
  bindHost(createHostRuntime({ store, engine, transport: { rootEvents }, appVersion: APP_VERSION, packs }));
  printLogEvents();
  appPacks = packs;
  appStore = store;
  return { store, engine, packs };
}

/**
 * Names claimed by a connection rather than registered by a pack: `host/drive`, which an agent driving the app
 * takes so a system can be told to answer *it*. An instance, created here with the rest of this process's
 * resources, written by `bus.claim` and read by the bus when it addresses an outgoing message.
 */
export const appClaims = createParticipantClaims();

// Exported for graceful shutdown (SIGTERM handler stops the actor system)
export let backendActor: ReturnType<typeof createActor<ReturnType<typeof createAppBus>>>;

export async function setupBackend(): Promise<void> {
  initializeLogCapture();

  // Before anything opens the database: a tool changing it (`apack db`) holds a lock until it's done, and opening
  // now would overwrite its change from this process's memory
  const appContext = resolveAppContext();
  assertNoDatabaseWriter(appContext.userDataDir);

  // The app's data: the engine persists to it from here on, and it's hydrated once the packs are registered
  const { store, packs } = openAppStore();

  // Packs require workspace @apack/* packages at runtime: from a checkout they must get source,
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
  // and apack install learns which apack uses this data dir
  prepareHostDataDirs({ userDataDir: appContext.userDataDir, packsDir: appContext.packsDir, version: APP_VERSION });

  // API keys: the settings system hears of every change to them
  forwardSecretsChanges(packs);

  // ── Install the packs the app ships, so every pack is an installed pack ────────────
  // Before loading, not beside it: a pack has to be in the packs dir to be discovered there. A copy whose
  // integrity matches this build's is left alone, so only a first boot and a version bump write anything
  const shippedDir = process.env.SHIPPED_PACKS_DIR;
  const shippedIds = new Set<string>();
  if (!shippedDir) {
    // "This app ships no packs" and "nobody told me where they are" are different answers, and installing
    // nothing looks the same either way: on a fresh data dir both give an app with no plugins
    console.warn('[packs] SHIPPED_PACKS_DIR is not set, so no pack the app ships is installed');
  } else {
    const results = await installShippedPacks(shippedDir, appContext.packsDir, { hostVersion: APP_VERSION, packFormat: PACK_SNAPSHOT_FORMAT });
    if (results.length === 0) console.warn(`[packs] ${shippedDir} holds no pack to install`);
    for (const result of results) {
      // Shipped whatever the install came to: the app refuses to uninstall it either way, and a pack whose
      // install failed is one the Packs view reports rather than one it offers to remove
      shippedIds.add(result.id);
      if (result.outcome === 'failed') console.error(`[packs] Could not install ${result.id}, which this app ships: ${result.error}`);
      else if (result.outcome !== 'current') console.log(`[packs] ${result.outcome === 'updated' ? 'Updated' : 'Installed'} ${result.id}, which this app ships`);
    }
  }

  // ── Load packs ────────────
  const { loaded: loadedPacks } = loadAppPacks(packs, shippedIds);

  console.log(`[app] apack v${APP_VERSION} startupId=${process.env.APACK_STARTUP_ID ?? 'unknown'}`);

  // ── Wire shutdown hooks (keyed by pack ID for scoped reload teardown) ──
  for (const pack of loadedPacks) {
    if (pack.registration.boot?.onShutdown) {
      packs.registerShutdownHook(pack.registration.boot.onShutdown, pack.origin.id);
    }
  }

  // ── Hydrate (policy now sees all entity types from all packs)
  await store.hydrate();

  // ── Start the packs: each one's onInit, the migrations (the app's, then external packs'), the content
  startPacks(packs);

  // ── Start backend actor ──────────────────────────────────────────────
  backendActor = createActor(createAppBus(packs, appClaims), {
    systemId: HOST.bus,
  }).start();

  backendActor.subscribe(logErrors('Backend'));
}
