import fs from 'fs-extra';
import path from 'node:path';
import { createLogger } from '@abuddy/sdk/logger';
import { getLmdbPath, getVolatileLmdbPath, getMediaPath } from '@abuddy/sdk/utils';
import type { LmdbStore } from '@abuddy/ears/lmdb';

const logger = createLogger('database:backup');

// Resolved per call: paths depend on the app environment, which isn't known at import time
const DATABASE_PATHS = {
  lmdb: getLmdbPath,
  volatileLmdb: getVolatileLmdbPath,
} as const;

type DatabaseName = keyof typeof DATABASE_PATHS;
const isKnownDatabase = (name: string): name is DatabaseName => Object.hasOwn(DATABASE_PATHS, name);

export async function exportDatabase(
  targetPath: string,
  name?: string,
  databases: DatabaseName[] = ['lmdb']
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fullBackupPath = path.join(targetPath, name || `agentbuddy-backup-${timestamp}`);

  await fs.ensureDir(fullBackupPath);

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
    const sourcePath = DATABASE_PATHS[dbName]();
    if (await fs.pathExists(sourcePath)) {
      await fs.copy(sourcePath, path.join(fullBackupPath, dbName));
      logger.info(`Backed up ${dbName}`);
    }
  }

  if (includesMedia) {
    await fs.copy(getMediaPath(), path.join(fullBackupPath, 'media'));
    logger.info('Backed up media assets');
  }

  logger.info('Backup completed', { path: fullBackupPath });
  return fullBackupPath;
}

/** Replaces `store`'s files (and media) with the backup's, closing the store meanwhile; puts the old files back if that fails */
export async function importDatabase(store: LmdbStore, backupPath: string) {
  if (!await fs.pathExists(path.join(backupPath, 'metadata.json'))) {
    throw new Error('Invalid backup: metadata.json not found');
  }

  const metadata = await fs.readJson(path.join(backupPath, 'metadata.json'));
  // Only the databases the app has are restored; any other a backup's metadata lists is left out
  const listed = metadata.databases as string[];
  const databases = listed.filter(isKnownDatabase);
  const skipped = listed.filter((name) => !isKnownDatabase(name));
  if (skipped.length > 0) logger.warn('Skipping databases the app does not have', { skipped });
  const tempBackupPath = path.join(path.dirname(getLmdbPath()), 'temp-backup-' + Date.now());

  await fs.ensureDir(tempBackupPath);
  for (const dbName of databases) {
    const sourcePath = DATABASE_PATHS[dbName]();
    if (await fs.pathExists(sourcePath)) {
      await fs.copy(sourcePath, path.join(tempBackupPath, dbName));
    }
  }

  const mediaPath = getMediaPath();
  const backupMediaPath = path.join(backupPath, 'media');
  const hasMediaInBackup = await fs.pathExists(backupMediaPath);

  if (hasMediaInBackup && await fs.pathExists(mediaPath)) {
    await fs.copy(mediaPath, path.join(tempBackupPath, 'media'));
  }

  try {
    store.close();

    for (const dbName of databases) {
      const backupDbPath = path.join(backupPath, dbName);
      const targetPath = DATABASE_PATHS[dbName]();

      if (await fs.pathExists(backupDbPath)) {
        await fs.remove(targetPath);
        await fs.copy(backupDbPath, targetPath);
        logger.info(`Imported ${dbName}`);
      }
    }

    if (hasMediaInBackup) {
      await fs.remove(mediaPath);
      await fs.copy(backupMediaPath, mediaPath);
      logger.info('Restored media assets');
    }

    store.reopen();

    await fs.remove(tempBackupPath);
    logger.info('Import completed');
    return { databases, skipped };
  } catch (error) {
    store.close();

    for (const dbName of databases) {
      const tempDbPath = path.join(tempBackupPath, dbName);
      const targetPath = DATABASE_PATHS[dbName]();
      if (await fs.pathExists(tempDbPath)) {
        await fs.remove(targetPath);
        await fs.copy(tempDbPath, targetPath);
      }
    }

    const tempMediaPath = path.join(tempBackupPath, 'media');
    if (await fs.pathExists(tempMediaPath)) {
      await fs.remove(mediaPath);
      await fs.copy(tempMediaPath, mediaPath);
    }

    store.reopen();

    await fs.remove(tempBackupPath);
    throw error;
  }
}

export async function getBackupInfo(backupPath: string) {
  try {
    const metadataPath = path.join(backupPath, 'metadata.json');
    if (!await fs.pathExists(metadataPath)) return null;

    const metadata = await fs.readJson(metadataPath);
    // The databases a restore would bring back (see importDatabase)
    const databases = (metadata.databases as string[]).filter(isKnownDatabase);
    let totalSize = 0;

    for (const dbName of databases) {
      const dbPath = path.join(backupPath, dbName);
      if (await fs.pathExists(dbPath)) {
        totalSize += (await fs.stat(dbPath)).size;
      }
    }

    const hasMedia = await fs.pathExists(path.join(backupPath, 'media'));

    return {
      timestamp: metadata.timestamp,
      databases,
      size: totalSize,
      hasMedia,
    };
  } catch {
    return null;
  }
}
