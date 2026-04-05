import path from 'node:path';
import fs from 'fs-extra';
import { migrations, TARGET_DATA_VERSION } from './registry';
import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import { exportDatabase } from '@/systems/database/backup';
import { getUserDataPath } from '@/core/helpers/paths';
import type { Migration, MigrationResult } from './types';

/**
 * Compare two semver-like version strings (e.g., '0.1.0' > '0.0.9').
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

/**
 * Run all pending data migrations sequentially.
 * Auto-backs up before migrating. Updates the data version after each step
 * so partial failures are resumable on next startup.
 */
export async function runMigrations(): Promise<MigrationResult> {
  const internal = settingsQueries.getInternalSettings();
  const currentVersion = internal.version;

  // Downgrade protection: data was written by a newer app version
  if (compareVersions(currentVersion, TARGET_DATA_VERSION) > 0) {
    throw new Error(
      `Data version ${currentVersion} is newer than this app supports (${TARGET_DATA_VERSION}). ` +
      `Please update AgentBuddy to the latest version.`
    );
  }

  // Build migration chain from current version forward
  const chain: Migration[] = [];
  let version = currentVersion;
  for (const m of migrations) {
    if (m.fromVersion === version) {
      chain.push(m);
      version = m.toVersion;
    }
  }

  if (chain.length === 0) {
    return { migrated: false, fromVersion: currentVersion, toVersion: currentVersion };
  }

  // Auto-backup before migrating
  const backupDir = path.join(getUserDataPath(), 'pre-migration-backups');
  const backupName = `pre-migration-${currentVersion}-${Date.now()}`;
  console.log(`[Migration] Backing up data before migrating (${currentVersion} → ${version})...`);
  await exportDatabase(backupDir, backupName);

  // Execute chain
  for (const migration of chain) {
    console.log(`[Migration] Running: ${migration.description} (${migration.fromVersion} → ${migration.toVersion})`);
    await migration.migrate();
    settingsCommands.updateSettings('internal', null, ['version'], migration.toVersion);
  }

  console.log(`[Migration] Complete: ${currentVersion} → ${version} (${chain.length} migration${chain.length > 1 ? 's' : ''})`);
  return { migrated: true, fromVersion: currentVersion, toVersion: version };
}

/**
 * Detect if the app binary version changed since last run.
 * Returns true on first launch after an update. Also cleans up old backups.
 */
export function checkAppVersionChange(): boolean {
  const internal = settingsQueries.getInternalSettings();
  const lastAppVersion = internal.lastAppVersion;
  const currentAppVersion = process.env.APP_VERSION;

  if (!currentAppVersion || lastAppVersion === currentAppVersion) {
    return false;
  }

  console.log(`[Upgrade] App version changed: ${lastAppVersion ?? 'unknown'} → ${currentAppVersion}`);
  settingsCommands.updateSettings('internal', null, ['lastAppVersion'], currentAppVersion);

  // Clean up old pre-migration backups (>30 days)
  cleanupOldBackups(30);

  return true;
}

function cleanupOldBackups(maxAgeDays: number) {
  const backupDir = path.join(getUserDataPath(), 'pre-migration-backups');
  if (!fs.existsSync(backupDir)) return;

  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  try {
    for (const entry of fs.readdirSync(backupDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const metadataPath = path.join(backupDir, entry.name, 'metadata.json');
      try {
        const metadata = fs.readJsonSync(metadataPath);
        if (metadata.timestamp < cutoff) {
          fs.removeSync(path.join(backupDir, entry.name));
          console.log(`[Upgrade] Removed old backup: ${entry.name}`);
        }
      } catch {
        // Skip entries without valid metadata
      }
    }
  } catch {
    // Backup dir may not exist yet
  }
}
