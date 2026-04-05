import * as fs from 'node:fs';
import * as path from 'node:path';
import { getUserDataPath, getLmdbPath, getSecretsLmdbPath } from '@/core/helpers/paths';

/**
 * Copies ears-db and ears-secrets directories to a timestamped backup folder.
 * Returns the backup directory path.
 */
export function backupBeforeMigration(fromVersion: number, toVersion: number): string {
  const userDataPath = getUserDataPath();
  const backupDir = path.join(userDataPath, 'backups', `pre-migration-v${fromVersion}-to-v${toVersion}`);

  // Skip if backup already exists (e.g. retrying after crash)
  if (fs.existsSync(backupDir)) {
    console.log(`[Migration] Backup already exists at ${backupDir}, skipping`);
    return backupDir;
  }

  fs.mkdirSync(backupDir, { recursive: true });

  const sources: [string, string][] = [
    [getLmdbPath(), 'ears-db'],
    [getSecretsLmdbPath(), 'ears-secrets'],
  ];

  for (const [src, name] of sources) {
    if (fs.existsSync(src)) {
      const dest = path.join(backupDir, name);
      fs.cpSync(src, dest, { recursive: true });
      console.log(`[Migration] Backed up ${name}`);
    }
  }

  return backupDir;
}

/**
 * Prune old migration backups, keeping the most recent ones.
 */
export function pruneOldBackups(keepCount = 3): void {
  const backupsDir = path.join(getUserDataPath(), 'backups');
  if (!fs.existsSync(backupsDir)) return;

  const entries = fs.readdirSync(backupsDir)
    .filter(e => e.startsWith('pre-migration-'))
    .sort()
    .reverse();

  for (const entry of entries.slice(keepCount)) {
    fs.rmSync(path.join(backupsDir, entry), { recursive: true, force: true });
    console.log(`[Migration] Pruned old backup: ${entry}`);
  }
}
