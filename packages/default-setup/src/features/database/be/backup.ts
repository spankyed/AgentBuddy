import fs from 'fs-extra';
import path from 'node:path';
import { createLogger } from '@/core/shared/debug/logger';
import { getLmdbPath, getVolatileLmdbPath, getSecretsLmdbPath, getMediaPath } from '@/core/shared/paths'; // getSearchIndicesPath removed [SEARCH_INDEX_FF]
import { closePersistence, reinitializeLmdb } from '@/core/ears/attribute-storage';

const logger = createLogger('database:backup');

const DATABASE_PATHS = {
  lmdb: getLmdbPath(),
  // searchIndices: getSearchIndicesPath(), // [SEARCH_INDEX_FF]
  volatileLmdb: getVolatileLmdbPath(),
  secretsLmdb: getSecretsLmdbPath(),
} as const;

export async function exportDatabase(
  targetPath: string,
  name?: string,
  databases: Array<keyof typeof DATABASE_PATHS> = ['lmdb'] // 'searchIndices' removed [SEARCH_INDEX_FF]
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fullBackupPath = path.join(targetPath, name || `agentbuddy-backup-${timestamp}`);
  
  await fs.ensureDir(fullBackupPath);

  // Check if media assets should be included (when main database is selected)
  let includesMedia = false;
  if (databases.includes('lmdb')) {
    const mediaPath = getMediaPath();
    if (await fs.pathExists(mediaPath)) {
      includesMedia = true;
    }
  }

  await fs.writeJson(path.join(fullBackupPath, 'metadata.json'), {
    timestamp: Date.now(),
    databases,
    version: '1.0.0',
    includesMedia,
  });

  for (const dbName of databases) {
    const sourcePath = DATABASE_PATHS[dbName];
    if (await fs.pathExists(sourcePath)) {
      await fs.copy(sourcePath, path.join(fullBackupPath, dbName));
      logger.info(`Backed up ${dbName}`);
    }
  }

  // Bundle media assets when main database is included
  if (includesMedia) {
    await fs.copy(getMediaPath(), path.join(fullBackupPath, 'media'));
    logger.info('Backed up media assets');
  }

  logger.info('Backup completed', { path: fullBackupPath });
  return fullBackupPath;
}

export async function importDatabase(backupPath: string) {
  if (!await fs.pathExists(path.join(backupPath, 'metadata.json'))) {
    throw new Error('Invalid backup: metadata.json not found');
  }

  const metadata = await fs.readJson(path.join(backupPath, 'metadata.json'));
  const tempBackupPath = path.join(path.dirname(getLmdbPath()), 'temp-backup-' + Date.now());
  
  // Backup current databases
  await fs.ensureDir(tempBackupPath);
  for (const dbName of metadata.databases) {
    const sourcePath = DATABASE_PATHS[dbName as keyof typeof DATABASE_PATHS];
    if (await fs.pathExists(sourcePath)) {
      await fs.copy(sourcePath, path.join(tempBackupPath, dbName));
    }
  }

  // Backup current media assets if backup includes media
  const mediaPath = getMediaPath();
  const backupMediaPath = path.join(backupPath, 'media');
  const hasMediaInBackup = await fs.pathExists(backupMediaPath);

  if (hasMediaInBackup && await fs.pathExists(mediaPath)) {
    await fs.copy(mediaPath, path.join(tempBackupPath, 'media'));
  }

  try {
    // Close LMDB connections before modifying files
    closePersistence();

    // Import databases
    for (const dbName of metadata.databases) {
      const backupDbPath = path.join(backupPath, dbName);
      const targetPath = DATABASE_PATHS[dbName as keyof typeof DATABASE_PATHS];

      if (await fs.pathExists(backupDbPath)) {
        await fs.remove(targetPath);
        await fs.copy(backupDbPath, targetPath);
        logger.info(`Imported ${dbName}`);
      }
    }

    // Restore media assets if present in backup
    if (hasMediaInBackup) {
      await fs.remove(mediaPath);
      await fs.copy(backupMediaPath, mediaPath);
      logger.info('Restored media assets');
    }

    // Reopen LMDB connections with new files
    reinitializeLmdb();

    await fs.remove(tempBackupPath);
    logger.info('Import completed');
    return { databases: metadata.databases as string[] };
  } catch (error) {
    // Restore on failure
    closePersistence();

    for (const dbName of metadata.databases) {
      const tempDbPath = path.join(tempBackupPath, dbName);
      const targetPath = DATABASE_PATHS[dbName as keyof typeof DATABASE_PATHS];
      if (await fs.pathExists(tempDbPath)) {
        await fs.remove(targetPath);
        await fs.copy(tempDbPath, targetPath);
      }
    }

    // Restore media from temp backup on failure
    const tempMediaPath = path.join(tempBackupPath, 'media');
    if (await fs.pathExists(tempMediaPath)) {
      await fs.remove(mediaPath);
      await fs.copy(tempMediaPath, mediaPath);
    }

    reinitializeLmdb();

    await fs.remove(tempBackupPath);
    throw error;
  }
}

export async function getBackupInfo(backupPath: string) {
  try {
    const metadataPath = path.join(backupPath, 'metadata.json');
    if (!await fs.pathExists(metadataPath)) return null;
    
    const metadata = await fs.readJson(metadataPath);
    let totalSize = 0;
    
    for (const dbName of metadata.databases) {
      const dbPath = path.join(backupPath, dbName);
      if (await fs.pathExists(dbPath)) {
        totalSize += (await fs.stat(dbPath)).size;
      }
    }

    const mediaPath = path.join(backupPath, 'media');
    const hasMedia = await fs.pathExists(mediaPath);

    return {
      timestamp: metadata.timestamp,
      databases: metadata.databases,
      size: totalSize,
      hasMedia,
    };
  } catch {
    return null;
  }
}