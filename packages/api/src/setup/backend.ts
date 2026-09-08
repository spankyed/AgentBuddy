import '@/setup/sdk-host-init';
import { createActor } from 'xstate';
import { logErrors } from '@/core/shared/actor-helpers';
import { getBootHooks, runRegisteredBootSeeds, registerHostSystem } from '@/core/packs/pack-registration';
import { registerShutdownHook } from '@/core/shared/lifecycle';
import { packsSystem, packsEvents, setBuiltInPacks } from '@/core/packs/packs-system';
import {
  loadBuiltInPacks,
  loadExternalPacks, registerExternalPacks, seedPackData,
} from '@/core/packs/pack-loader';
import { discoverBuiltInPacks } from '@/core/packs/pack-discovery';
import { backendSystem } from '@/systems';
import { bus } from '@/core/system-ids';
import { initializeLogCapture } from '@/core/shared/debug/log-capture';
import { hydrateSharded } from '@/core/persistence/partitioning/hydrate-sharded';
import { envs, policy, persistence } from '@/core/ears/attribute-storage';
import { seedData } from '@abuddy/sdk/utils';
import { repository } from '@abuddy/sdk/ears';
import { runMigrations, runPackMigrations } from '@/setup/migrations';
import { APP_VERSION } from '@/version';
import { setLoadedPacks } from '@/core/packs/pack-api';

// Exported for graceful shutdown (SIGTERM handler stops the actor system)
export let backendActor: ReturnType<typeof createActor<typeof backendSystem>>;

export async function setupBackend(): Promise<void> {
  initializeLogCapture();

  // ── Register host-level systems (before any pack loading) ──────────
  registerHostSystem('packs', packsSystem, packsEvents);

  // ── Load built-in packs (discover → import directly) ───────────────
  const builtInDir = process.env.BUILT_IN_PACKS_DIR;
  if (builtInDir) {
    await loadBuiltInPacks(builtInDir);
    setBuiltInPacks(discoverBuiltInPacks(builtInDir));
  }

  // Run early boot hooks (logs system must start before anything else)
  for (const hooks of getBootHooks()) {
    if (hooks.earlySystem) {
      const logsActor = createActor(hooks.earlySystem).start();
      logsActor.subscribe(logErrors('Logs'));
    }
  }

  console.log(`[app] AgentBuddy v${APP_VERSION} startupId=${process.env.AGENTBUDDY_STARTUP_ID ?? 'unknown'}`);

  // ── Discover & register external packs (before hydration so EARS types are visible to policy)
  let externalPacks = loadExternalPacks();
  if (externalPacks.length > 0) {
    externalPacks = registerExternalPacks(externalPacks);
  }

  // ── Wire shutdown hooks for ALL registered packs ────────────────────
  for (const hooks of getBootHooks()) {
    if (hooks.shutdown) registerShutdownHook(hooks.shutdown);
  }

  // ── Hydrate (policy now sees all entity types from all packs)
  await hydrateSharded({ envs, policy, shardedPersistence: persistence });

  // ── Default settings for ALL packs (built-in + external)
  for (const hooks of getBootHooks()) {
    hooks.createDefaultSettings?.();
  }

  // ── Host migrations ─────────────────────────────────────────────────
  runMigrations();

  // ── Per-pack migrations ─────────────────────────────────────────────
  if (externalPacks.length > 0) {
    runPackMigrations(externalPacks);
  }

  // ── Seeds ───────────────────────────────────────────────────────────
  runRegisteredBootSeeds();

  if (externalPacks.length > 0) {
    seedPackData(
      externalPacks,
      seedData,
      () => repository.settingsQueries.getInternalSettings().packSeedHashes ?? {},
      (hashes) => repository.settingsCommands.updateSettings('internal', null, ['packSeedHashes'], hashes),
    );
    setLoadedPacks(externalPacks);
  }

  // ── Start backend actor ──────────────────────────────────────────────
  backendActor = createActor(backendSystem, {
    systemId: bus,
  }).start();

  backendActor.subscribe(logErrors('Backend'));
}
