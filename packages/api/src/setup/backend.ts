import { createActor } from 'xstate';
import { logErrors } from '@/core/shared/actor-helpers';
import { logsSystem } from '@/systems/logs/system';
import { backendSystem } from '@/systems/backend';
import { bus } from '@/core/system-ids';
import { initializeLogCapture } from '@/core/shared/debug/log-capture';
import { hydrateSharded } from '@/core/persistence/partitioning/hydrate-sharded';
import { envs, policy, persistence } from '@/core/ears/attribute-storage';
import { createDefaultSettings } from '@/systems/settings/repository';
import { runBootSeed } from '@/setup/seed/index';
import { runMigrations } from '@/setup/migrations';
import { APP_VERSION } from '@/version';

// Exported for graceful shutdown (SIGTERM handler stops the actor system)
export let backendActor: ReturnType<typeof createActor<typeof backendSystem>>;

export async function setupBackend(): Promise<void> {
  // Initialize log capture first to catch all logs
  initializeLogCapture();

  // Start logs actor before any other work
  const logsActor = createActor(logsSystem).start();
  logsActor.subscribe(logErrors('Logs'));

  console.log(`[app] AgentBuddy v${APP_VERSION}`);

  // Hydrate from LMDB using sharded approach (primary partition only by default)
  // Pass shardedPersistence to seed metadata caches
  await hydrateSharded({ envs, policy, shardedPersistence: persistence });

  // Initialize default settings if they don't exist
  createDefaultSettings();

  // Run versioned data migrations
  runMigrations();

  // Seed compiled artifacts (runs once, skipped on subsequent startups)
  runBootSeed();

  // Start backend actor
  backendActor = createActor(backendSystem, {
    systemId: bus,
  }).start();

  backendActor.subscribe(logErrors('Backend'));
}
