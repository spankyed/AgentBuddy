import '@/setup/sdk-host-init';
import { createActor } from 'xstate';
import { logErrors } from '@/core/shared/actor-helpers';
import { earlyBootSystem, createDefaultSettings } from '@/registries/boot';
import { backendSystem } from '@/systems/backend';
import { bus } from '@/core/system-ids';
import { initializeLogCapture } from '@/core/shared/debug/log-capture';
import { hydrateSharded } from '@/core/persistence/partitioning/hydrate-sharded';
import { envs, policy, persistence } from '@/core/ears/attribute-storage';
import { runBootSeed, seedData } from '@/registries/seed/index';
import { repository } from '@abuddy/sdk/ears';
import { runMigrations } from '@/setup/migrations';
import { APP_VERSION } from '@/version';
import { loadExternalPacks, registerPackSystems, seedPackData } from '@/core/packs/pack-loader';
import { setLoadedPacks } from '@/core/packs/pack-api';
import systems, { eventValidationMap } from '@/systems';

// Exported for graceful shutdown (SIGTERM handler stops the actor system)
export let backendActor: ReturnType<typeof createActor<typeof backendSystem>>;

export async function setupBackend(): Promise<void> {
  // Initialize log capture first to catch all logs
  initializeLogCapture();

  // Start logs actor before any other work
  const logsActor = createActor(earlyBootSystem).start();
  logsActor.subscribe(logErrors('Logs'));

  console.log(`[app] AgentBuddy v${APP_VERSION} startupId=${process.env.AGENTBUDDY_STARTUP_ID ?? 'unknown'}`);

  // Hydrate from LMDB using sharded approach (primary partition only by default)
  // Pass shardedPersistence to seed metadata caches
  await hydrateSharded({ envs, policy, shardedPersistence: persistence });

  // Initialize default settings if they don't exist
  createDefaultSettings();

  // Run versioned data migrations
  runMigrations();

  // Seed compiled artifacts (runs once, skipped on subsequent startups)
  runBootSeed();

  // Load and register external pack systems + seed their data artifacts
  const externalPacks = loadExternalPacks();
  if (externalPacks.length > 0) {
    registerPackSystems(externalPacks, systems as Record<string, any>, eventValidationMap);
    seedPackData(
      externalPacks,
      seedData,
      () => repository.settingsQueries.getInternalSettings().packSeedHashes ?? {},
      (hashes) => repository.settingsCommands.updateSettings('internal', null, ['packSeedHashes'], hashes),
    );
    setLoadedPacks(externalPacks);
  }

  // Start backend actor
  backendActor = createActor(backendSystem, {
    systemId: bus,
  }).start();

  backendActor.subscribe(logErrors('Backend'));
}
