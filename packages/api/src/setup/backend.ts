import '@/setup/sdk-host-init';
import { createActor } from 'xstate';
import { logErrors } from '@/core/shared/actor-helpers';
import { getBootHooks, runRegisteredBootSeeds } from '@/core/packs/pack-registration';
import { loadBuiltInPack } from '@/core/packs/pack-loader';
import { backendSystem } from '@/systems';
import { bus } from '@/core/system-ids';
import { initializeLogCapture } from '@/core/shared/debug/log-capture';
import { hydrateSharded } from '@/core/persistence/partitioning/hydrate-sharded';
import { envs, policy, persistence } from '@/core/ears/attribute-storage';
import { seedData } from '@abuddy/sdk/utils';
import { repository } from '@abuddy/sdk/ears';
import { runMigrations } from '@/setup/migrations';
import { APP_VERSION } from '@/version';
import { loadExternalPacks, registerExternalPacks, seedPackData } from '@/core/packs/pack-loader';
import { setLoadedPacks } from '@/core/packs/pack-api';

// Exported for graceful shutdown (SIGTERM handler stops the actor system)
export let backendActor: ReturnType<typeof createActor<typeof backendSystem>>;

export async function setupBackend(): Promise<void> {
  initializeLogCapture();

  // ── Register built-in pack ──────────────────────────────────────────
  loadBuiltInPack();

  // Run early boot hooks (logs system must start before anything else)
  for (const hooks of getBootHooks()) {
    if (hooks.earlySystem) {
      const logsActor = createActor(hooks.earlySystem).start();
      logsActor.subscribe(logErrors('Logs'));
    }
  }

  console.log(`[app] AgentBuddy v${APP_VERSION} startupId=${process.env.AGENTBUDDY_STARTUP_ID ?? 'unknown'}`);

  await hydrateSharded({ envs, policy, shardedPersistence: persistence });

  for (const hooks of getBootHooks()) {
    hooks.createDefaultSettings?.();
  }

  runMigrations();

  // Seed all registered packs
  runRegisteredBootSeeds();

  // ── Load external packs ──────────────────────────────────────────────
  const externalPacks = loadExternalPacks();
  if (externalPacks.length > 0) {
    registerExternalPacks(externalPacks);
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
