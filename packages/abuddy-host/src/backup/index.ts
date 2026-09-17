import fs from 'fs-extra';
import path from 'node:path';
import { createLogger } from '@abuddy/sdk/logger';
import { closeEnv, openEnvAt, type LmdbStore } from '@abuddy/ears/lmdb';
import { UnknownBackupDatabasesError } from '@abuddy/sdk/services';

const logger = createLogger('database:backup');

/** A backup's database folders, by the partition of the store they hold */
const DATABASE_PARTITIONS = {
  lmdb: 'primary',
  volatileLmdb: 'volatileBackup',
} as const;

export type DatabaseName = keyof typeof DATABASE_PARTITIONS;
export const isKnownDatabase = (name: string): name is DatabaseName => Object.hasOwn(DATABASE_PARTITIONS, name);

/** Where a backup's database folder comes from and goes to: the store's partition */
const databasePath = (store: Pick<LmdbStore, 'paths'>, name: DatabaseName) => store.paths[DATABASE_PARTITIONS[name]];

/** Copies `store`'s databases (and the media folder `mediaPath`, with the primary database) into a new backup folder */
export async function exportDatabase(
  store: Pick<LmdbStore, 'paths'>,
  targetPath: string,
  { name, databases = ['lmdb'], mediaPath }: { name?: string; databases?: DatabaseName[]; mediaPath: string },
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fullBackupPath = path.join(targetPath, name || `agentbuddy-backup-${timestamp}`);

  await fs.ensureDir(fullBackupPath);

  let includesMedia = false;
  if (databases.includes('lmdb')) {
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
    const sourcePath = databasePath(store, dbName);
    if (await fs.pathExists(sourcePath)) {
      await fs.copy(sourcePath, path.join(fullBackupPath, dbName));
      logger.info(`Backed up ${dbName}`);
    }
  }

  if (includesMedia) {
    await fs.copy(mediaPath, path.join(fullBackupPath, 'media'));
    logger.info('Backed up media assets');
  }

  logger.info('Backup completed', { path: fullBackupPath });
  return fullBackupPath;
}

/**
 * Replaces `store`'s files (and the media folder `mediaPath`) with the backup's, closing the store meanwhile; puts the
 * old files back if that fails
 */
export async function importDatabase(
  store: LmdbStore,
  backupPath: string,
  mediaPath: string,
  { skipUnknownDatabases = false }: { skipUnknownDatabases?: boolean } = {},
) {
  // Checked before anything is replaced: a backup this app can't restore must not cost the user their data first
  const { databases, unknownDatabases, missingDatabases } = readBackup(backupPath);
  if (unknownDatabases.length > 0 && !skipUnknownDatabases) throw new UnknownBackupDatabasesError(unknownDatabases);
  if (unknownDatabases.length > 0) logger.warn('Importing without the stores this AgentBuddy does not have', { unknownDatabases });
  // Said rather than silently done: the folder may have been lost since, not just never written
  if (missingDatabases.length > 0) logger.warn('The backup lists stores it has no folder for; they are restored as empty', { missingDatabases });
  const tempBackupPath = path.join(path.dirname(store.paths.primary), 'temp-backup-' + Date.now());

  await fs.ensureDir(tempBackupPath);
  for (const dbName of databases) {
    const sourcePath = databasePath(store, dbName);
    if (await fs.pathExists(sourcePath)) {
      await fs.copy(sourcePath, path.join(tempBackupPath, dbName));
    }
  }

  const backupMediaPath = path.join(backupPath, 'media');
  const hasMediaInBackup = await fs.pathExists(backupMediaPath);

  if (hasMediaInBackup && await fs.pathExists(mediaPath)) {
    await fs.copy(mediaPath, path.join(tempBackupPath, 'media'));
  }

  try {
    store.close();

    for (const dbName of databases) {
      const backupDbPath = path.join(backupPath, dbName);
      const targetPath = databasePath(store, dbName);

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
    return { databases, missingDatabases };
  } catch (error) {
    store.close();

    for (const dbName of databases) {
      const tempDbPath = path.join(tempBackupPath, dbName);
      const targetPath = databasePath(store, dbName);
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

/** What a backup holds, read without changing it */
export interface BackupContents {
  timestamp?: number;
  /** The databases it restores */
  databases: DatabaseName[];
  hasMedia: boolean;
  /** Entities per type in its primary database, for the given types that have some */
  counts: Array<[string, number]>;
  /** Stores the backup holds that this AgentBuddy doesn't have: importing leaves them out */
  unknownDatabases: string[];
  /** Stores its metadata lists with no folder to restore: empty when the backup was made, or lost since */
  missingDatabases: DatabaseName[];
}

/**
 * Checks the backup at `dir` restores into this app and reads what it holds: its metadata lists the primary database
 * (`lmdb`), which is there and opens (so a backup in another storage format is refused here, not half-way through an
 * import). A listed database whose folder is missing was empty and is left out, as the import leaves it out, and one
 * this AgentBuddy doesn't have is reported as `unknownDatabases` for the caller to decide about. Throws naming what's
 * wrong. `entityTypes` are the types to count.
 */
export function readBackup(dir: string, entityTypes: Iterable<string> = []): BackupContents {
  const metadataFile = path.join(dir, 'metadata.json');
  if (!fs.existsSync(metadataFile)) throw new Error(`${dir} isn't a backup: it has no metadata.json`);
  let metadata: { timestamp?: unknown; databases?: unknown };
  try {
    metadata = fs.readJsonSync(metadataFile);
  } catch (error) {
    throw new Error(`${metadataFile} can't be read: ${(error as Error).message}`);
  }
  if (!Array.isArray(metadata.databases)) throw new Error(`${metadataFile} lists no databases`);
  const unknownDatabases = metadata.databases.filter((name) => !isKnownDatabase(String(name))).map(String);
  const listed = metadata.databases.filter((name) => isKnownDatabase(String(name))) as DatabaseName[];
  const missingDatabases = listed.filter((name) => !fs.existsSync(path.join(dir, name, 'data.mdb')));
  if (!listed.includes('lmdb')) throw new Error("The backup doesn't include the database (lmdb)");
  // A listed database whose folder isn't there was empty when the backup was made, and the import skips it too
  const databases = listed.filter((name) => !missingDatabases.includes(name));
  if (!databases.includes('lmdb')) throw new Error(`The backup's lmdb folder is missing or has no data.mdb`);

  const env = openEnvAt(path.join(dir, 'lmdb'), { readOnly: true });
  try {
    const perType = new Map<string, number>();
    for (const { value } of env.entities.getRange() as Iterable<{ value: { type?: string } }>) {
      if (value.type) perType.set(value.type, (perType.get(value.type) ?? 0) + 1);
    }
    const counts = [...entityTypes].sort()
      .flatMap((type) => (perType.has(type) ? [[type, perType.get(type)!] as [string, number]] : []));
    return {
      ...(typeof metadata.timestamp === 'number' && { timestamp: metadata.timestamp }),
      databases,
      unknownDatabases,
      missingDatabases,
      hasMedia: fs.existsSync(path.join(dir, 'media')),
      counts,
    };
  } finally {
    closeEnv(env, () => {});
  }
}
