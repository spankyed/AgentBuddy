import type { LmdbDbs } from '../lmdb/envs';
import type { Partition } from '../partitioning/policy';
import { readSchemaVersion, writeSchemaVersion } from './version';
import { migrations } from './registry';
import { backupBeforeMigration, pruneOldBackups } from './backup';

export interface MigrationResult {
  previousVersion: number;
  currentVersion: number;
}

/**
 * Runs pending LMDB migrations on the primary partition.
 * Must be called AFTER openEnvAt() but BEFORE hydrateSharded().
 */
export function runMigrations(envs: Record<Partition, LmdbDbs>): MigrationResult {
  const primaryDbs = envs.primary;
  const dbVersion = readSchemaVersion(primaryDbs.entities);
  const appVersion = migrations.at(-1)?.version ?? 0;

  // Downgrade protection
  if (dbVersion > appVersion) {
    throw new Error(
      `Database schema (v${dbVersion}) is newer than this app supports (v${appVersion}). ` +
      `Please update AgentBuddy or reset your data.`
    );
  }

  const pending = migrations.filter(m => m.version > dbVersion);

  if (pending.length === 0) {
    return { previousVersion: dbVersion, currentVersion: dbVersion };
  }

  const targetVersion = pending.at(-1)!.version;

  // Backup before migrating
  try {
    backupBeforeMigration(dbVersion, targetVersion);
  } catch (err) {
    console.warn('[Migration] Backup failed, proceeding anyway:', err);
  }

  console.log(`[Migration] Running ${pending.length} migration(s) from v${dbVersion}...`);

  for (const migration of pending) {
    console.log(`[Migration] v${migration.version}: ${migration.description}`);
    primaryDbs.root.transactionSync(() => {
      migration.up(primaryDbs);
      writeSchemaVersion(primaryDbs.entities, migration.version);
    });
  }

  console.log(`[Migration] Complete. Schema now at v${targetVersion}`);

  // Prune old backups after success
  try {
    pruneOldBackups();
  } catch (err) {
    console.warn('[Migration] Backup pruning failed:', err);
  }

  return { previousVersion: dbVersion, currentVersion: targetVersion };
}

/**
 * Runs postHydrate hooks for migrations that were executed during this startup.
 * Must be called AFTER hydrateSharded().
 */
export function runPostHydrateHooks(result: MigrationResult): void {
  if (result.previousVersion === result.currentVersion) return;

  const ran = migrations.filter(
    m => m.version > result.previousVersion && m.version <= result.currentVersion
  );

  for (const m of ran) {
    if (m.postHydrate) {
      console.log(`[Migration] Running postHydrate hook for v${m.version}`);
      m.postHydrate();
    }
  }
}
