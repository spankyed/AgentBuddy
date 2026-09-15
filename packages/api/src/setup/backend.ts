import '@/setup/sdk-host-init';
import { createActor } from 'xstate';
import { logErrors } from '@/core/shared/actor-helpers';
import { getBootHooks, getPackBootHooks, runRegisteredBootSeeds, registerHostSystem, publishHostPackArtifacts, prepareHostDataDirs } from '@abuddy/host/packs';
import { resolveAppContext } from '@abuddy/sdk/env';
import * as path from 'path';
import { registerShutdownHook } from '@abuddy/sdk/utils';
import { packsSystem, packsEvents, setBuiltInPacks } from '@/packs/packs-system';
import {
  loadBuiltInPacks, getBuiltInPackInfos,
  loadExternalPacks, registerExternalPacks,
} from '@/packs/pack-loader';
import { orchestrateDeclarativeSeed, seedPackData } from '@/packs/pack-seed';
import { backendSystem } from '@/systems';
import { bus } from '@/core/system-ids';
import { initializeLogCapture } from '@/core/shared/debug/log-capture';
import { hydrateSharded } from '@/core/persistence/partitioning/hydrate-sharded';
import { envs, policy, persistence } from '@/core/ears/attribute-storage';
import { seedData } from '@abuddy/sdk/utils';
import { settingsRepository } from '@abuddy/host/settings';
import { runMigrations, runPackMigrations } from '@/setup/migrations';
import { APP_VERSION } from '@/version';
import { setLoadedPacks, setBuiltInPacksForRegistry } from '@/packs/pack-api';
import { assertSourceResolution } from '@abuddy/host/build/source-resolution';
import { forwardSecretsChanges } from '@/core/router/secrets-router';
import { createRequire } from 'module';

// Exported for graceful shutdown (SIGTERM handler stops the actor system)
export let backendActor: ReturnType<typeof createActor<typeof backendSystem>>;

export async function setupBackend(): Promise<void> {
  initializeLogCapture();

  // Packs require workspace @abuddy/* packages at runtime: from a checkout they must get source,
  // not a stale dist (main starts the API with the condition; manual boots must pass it). The
  // packaged app runs the API on Electron's runtime and ships no workspace source.
  if (!process.versions.electron) {
    assertSourceResolution(createRequire(import.meta.url).resolve, 'The API server');
  }

  // ── Register host-level systems (before any pack loading) ──────────
  registerHostSystem('packs', packsSystem, packsEvents);

  // Before discovery: a pack an interrupted install left only as its moved-aside copy is restored,
  // and abuddy install learns which AgentBuddy uses this data dir
  const appContext = resolveAppContext();
  prepareHostDataDirs({ userDataDir: appContext.userDataDir, packsDirs: [appContext.packsDir, appContext.hostPacksDir], version: APP_VERSION });

  // API keys: the settings system hears of every change to them
  forwardSecretsChanges();

  // ── Load packs (built-in async + external sync overlap) ────────────
  const builtInDir = process.env.BUILT_IN_PACKS_DIR;
  const builtInPromise = builtInDir ? loadBuiltInPacks(builtInDir) : null;

  // External pack work is sync — runs while built-in loading is in flight
  let externalPacks = loadExternalPacks();
  if (externalPacks.length > 0) {
    externalPacks = registerExternalPacks(externalPacks);
  }

  if (builtInPromise) {
    const builtInPackInfos = await builtInPromise;
    setBuiltInPacks(builtInPackInfos);
    setBuiltInPacksForRegistry(builtInPackInfos);

    // Pack authors resolve built-in dependencies (types, step build code) from the installed app
    const { hostPacksDir } = resolveAppContext();
    for (const info of builtInPackInfos) {
      try {
        if (publishHostPackArtifacts(info.dir, path.join(hostPacksDir, info.id))) {
          console.log(`[packs] Published build artifacts for built-in pack ${info.id}`);
        }
      } catch (err) {
        console.warn(`[packs] Could not publish build artifacts for ${info.id}:`, err);
      }
    }
  }

  // Run early boot hooks (logs system must start before anything else)
  for (const hooks of getBootHooks()) {
    if (hooks.earlySystem) {
      const logsActor = createActor(hooks.earlySystem).start();
      logsActor.subscribe(logErrors('Logs'));
    }
  }

  console.log(`[app] AgentBuddy v${APP_VERSION} startupId=${process.env.AGENTBUDDY_STARTUP_ID ?? 'unknown'}`);

  // ── Wire shutdown hooks (keyed by pack ID for scoped reload teardown) ──
  for (const info of getBuiltInPackInfos()) {
    const hooks = getPackBootHooks(info.id);
    if (hooks?.onShutdown) {
      registerShutdownHook(hooks.onShutdown, info.id);
    }
  }
  for (const pack of externalPacks) {
    if (pack.boot?.onShutdown) {
      registerShutdownHook(pack.boot.onShutdown, pack.manifest.id);
    }
  }

  // ── Hydrate (policy now sees all entity types from all packs)
  await hydrateSharded({ envs, policy, shardedPersistence: persistence, skipTombstoneScan: true });

  // ── Initialize ALL packs (built-in + external)
  for (const hooks of getBootHooks()) {
    hooks.onInit?.();
  }

  // ── Host migrations ─────────────────────────────────────────────────
  runMigrations();

  // ── Per-pack migrations ─────────────────────────────────────────────
  if (externalPacks.length > 0) {
    runPackMigrations(externalPacks);
  }

  // ── Seeds ───────────────────────────────────────────────────────────
  runRegisteredBootSeeds(orchestrateDeclarativeSeed);

  if (externalPacks.length > 0) {
    seedPackData(
      externalPacks,
      seedData,
      () => settingsRepository.settingsQueries.getInternalSettings().packSeedHashes ?? {},
      (hashes) => settingsRepository.settingsCommands.updateSettings('internal', null, ['packSeedHashes'], hashes),
      { cleanupStaleHashes: true },
    );
    setLoadedPacks(externalPacks);
  }

  // ── Start backend actor ──────────────────────────────────────────────
  backendActor = createActor(backendSystem, {
    systemId: bus,
  }).start();

  backendActor.subscribe(logErrors('Backend'));
}
