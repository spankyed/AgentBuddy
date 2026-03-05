import { createActor } from 'xstate';
import { logErrors } from '@/core/helpers/actor-helpers';
import { logsSystem } from '@/systems/logs/system';
import { backendSystem, bus } from '@/systems/backend';
import { initializeLogCapture } from '@/core/helpers/debug/log-capture';
import { loadSnapshot } from '@/core/persistence/data';
import { hydrateSharded } from '@/core/persistence/partitioning/hydrate-sharded';
import { envs, policy, persistence } from '@/core/ears/attribute-storage';
import { createDefaultSettings } from '@/systems/settings/repository';
import { seedData } from '@/setup/seed';

export async function setupBackend(): Promise<void> {
  // Initialize log capture first to catch all logs
  initializeLogCapture();

  // Start logs actor before any other work
  const logsActor = createActor(logsSystem).start();
  logsActor.subscribe(logErrors('Logs'));

  // Hydrate from LMDB using sharded approach (primary partition only by default)
  // Pass shardedPersistence to seed metadata caches
  await hydrateSharded({ envs, policy, shardedPersistence: persistence });

  // Initialize default settings if they don't exist
  createDefaultSettings();

  // Seed compiled artifacts (runs once, skipped on subsequent startups)
  seedData();

  // Load data snapshot (can override LMDB data if needed)
  // await loadSnapshot();

  // Start backend actor
  const backendActor = createActor(backendSystem, {
    systemId: bus,
  }).start();

  backendActor.subscribe(logErrors('Backend'));
}