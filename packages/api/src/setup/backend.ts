import { createActor } from 'xstate';
import { logErrors } from '@/core/helpers/actor-helpers';
import { logsSystem } from '@/systems/logs/system';
import { backendSystem, bus } from '@/systems/backend';
import { initializeLogCapture } from '@/core/helpers/debug/log-capture';
import { hydrateSharded } from '@/core/persistence/partitioning/hydrate-sharded';
import { envs, policy, persistence, closePersistence, reinitializeLmdb } from '@/core/ears/attribute-storage';
import { createDefaultSettings } from '@/systems/settings/repository';
import { seedData } from '@/setup/seed/index';
import { runMigrations, checkAppVersionChange } from '@/core/migrations/index';

const DATA_CORRUPTION_EXIT_CODE = 42;

export async function setupBackend(): Promise<void> {
  // Initialize log capture first to catch all logs
  initializeLogCapture();

  // Start logs actor before any other work
  const logsActor = createActor(logsSystem).start();
  logsActor.subscribe(logErrors('Logs'));

  // Hydrate from LMDB with corruption recovery
  try {
    await hydrateSharded({ envs, policy, shardedPersistence: persistence });
  } catch (error) {
    console.error('[CRITICAL] Data hydration failed:', error);

    // Attempt recovery: reinitialize LMDB and retry once
    try {
      reinitializeLmdb();
      await hydrateSharded({ envs, policy, shardedPersistence: persistence });
      console.log('[Recovery] LMDB reinitialized successfully after hydration failure');
    } catch (retryError) {
      console.error('[CRITICAL] Recovery failed:', retryError);
      process.exit(DATA_CORRUPTION_EXIT_CODE);
    }
  }

  // Initialize default settings if they don't exist
  createDefaultSettings();

  // Run schema migrations (backs up automatically before migrating)
  const migrationResult = await runMigrations();
  if (migrationResult.migrated) {
    console.log(`[Migration] Migrated data from ${migrationResult.fromVersion} to ${migrationResult.toVersion}`);
  }

  // First-launch-after-update: force re-seed if app version changed
  const isNewAppVersion = checkAppVersionChange();
  seedData(isNewAppVersion ? { force: true } : undefined);

  // Start backend actor
  const backendActor = createActor(backendSystem, {
    systemId: bus,
  }).start();

  backendActor.subscribe(logErrors('Backend'));
}

/** Gracefully close LMDB persistence. Call before process exit. */
export function shutdownBackend(): void {
  try {
    closePersistence();
    console.log('[Shutdown] LMDB persistence closed');
  } catch (error) {
    console.warn('[Shutdown] Error closing persistence:', error);
  }
}

/** Exit code used when data corruption is detected and recovery fails. */
export { DATA_CORRUPTION_EXIT_CODE };
