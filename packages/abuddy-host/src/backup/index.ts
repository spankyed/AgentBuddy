import fs from 'fs-extra';
import path from 'node:path';
import { createLogger } from '@abuddy/sdk/logger';
import { closeEnv, openEnvAt, LMDB_FORMAT_VERSION, type LmdbStore } from '@abuddy/ears/lmdb';
import { UnknownBackupDatabasesError } from '@abuddy/sdk/services';

const logger = createLogger('database:backup');

/**
 * Where a backup's progress lines go. The app leaves this out and they go to the log, as every other app message
 * does; a tool passes its own sink, so the lines don't land in output meant to be read by something else (`abuddy
 * db import` writes results on stdout and everything else on stderr).
 */
export interface BackupLog {
  info(message: string): void;
  warn(message: string, detail?: Record<string, unknown>): void;
}

const defaultLog: BackupLog = {
  info: (message) => logger.info(message),
  warn: (message, detail) => logger.warn(message, detail),
};

/** A backup's database folders, by the partition of the store they hold */
const DATABASE_PARTITIONS = {
  lmdb: 'primary',
  volatileLmdb: 'volatileBackup',
} as const;

export type DatabaseName = keyof typeof DATABASE_PARTITIONS;
export const isKnownDatabase = (name: string): name is DatabaseName => Object.hasOwn(DATABASE_PARTITIONS, name);

/** Where a backup's database folder comes from and goes to: the store's partition */
const databasePath = (store: Pick<LmdbStore, 'paths'>, name: DatabaseName) => store.paths[DATABASE_PARTITIONS[name]];

/**
 * Copies `store`'s databases (and the media folder `mediaPath`, with the primary database) into a new backup folder.
 * Each database is copied by LMDB itself (`store.snapshot`), so a backup taken while the app is running holds the
 * database as of one moment rather than whatever the files happened to say as they were read.
 */
export async function exportDatabase(
  store: Pick<LmdbStore, 'paths' | 'snapshot'>,
  targetPath: string,
  { name, databases = ['lmdb'], mediaPath, appVersion, log = defaultLog }:
    { name?: string; databases?: DatabaseName[]; mediaPath: string; appVersion?: string; log?: BackupLog },
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
    includesMedia,
    // What wrote it, for the refusal message and for reading a backup folder by eye. Provenance only: whether a
    // backup restores is settled by opening its databases (readBackup), never by what this says.
    ...(appVersion !== undefined && { appVersion }),
    storageFormat: LMDB_FORMAT_VERSION,
  });

  for (const dbName of databases) {
    if (await fs.pathExists(databasePath(store, dbName))) {
      await store.snapshot(DATABASE_PARTITIONS[dbName], path.join(fullBackupPath, dbName));
      log.info(`Backed up ${dbName}`);
    }
  }

  if (includesMedia) {
    await fs.copy(mediaPath, path.join(fullBackupPath, 'media'));
    log.info('Backed up media assets');
  }

  log.info(`Backup completed: ${fullBackupPath}`);
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
  { skipUnknownDatabases = false, entityTypes = [], log = defaultLog }:
    { skipUnknownDatabases?: boolean; entityTypes?: Iterable<string>; log?: BackupLog } = {},
) {
  // Checked before anything is replaced: a backup this app can't restore must not cost the user their data first
  const { databases, unknownDatabases, missingDatabases, unknownEntityTypes } = readBackup(backupPath, entityTypes);
  if (unknownDatabases.length > 0 && !skipUnknownDatabases) throw new UnknownBackupDatabasesError(unknownDatabases);
  if (unknownDatabases.length > 0) log.warn('Importing without the stores this AgentBuddy does not have', { unknownDatabases });
  // Said rather than silently done: the folder may have been lost since, not just never written
  if (missingDatabases.length > 0) log.warn('The backup lists stores it has no folder for; they are restored as empty', { missingDatabases });
  // Restored, not dropped: the pack that declared them may be installed again
  if (unknownEntityTypes.length > 0) {
    log.warn('The backup holds entities of types no installed pack declares', { types: unknownEntityTypes.map(([type, count]) => `${type} (${count})`) });
  }
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
        log.info(`Imported ${dbName}`);
      }
    }

    if (hasMediaInBackup) {
      await fs.remove(mediaPath);
      await fs.copy(backupMediaPath, mediaPath);
      log.info('Restored media assets');
    }

    store.reopen();

    await fs.remove(tempBackupPath);
    log.info('Import completed');
    return { databases, missingDatabases, unknownEntityTypes };
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
      ...(typeof metadata.appVersion === 'string' && { appVersion: metadata.appVersion }),
    };
  } catch {
    return null;
  }
}

/** What a backup holds, read without changing it */
export interface BackupContents {
  timestamp?: number;
  /** The AgentBuddy that made it, when it recorded one */
  appVersion?: string;
  /**
   * The storage format its databases were written in, when it recorded one. Provenance only: whether this build can
   * read them is settled by opening them, so a backup that opens restores whatever this says.
   */
  storageFormat?: number;
  /** The databases it restores */
  databases: DatabaseName[];
  hasMedia: boolean;
  /** Entities per type in its primary database, for the given types that have some */
  counts: Array<[string, number]>;
  /** Stores the backup holds that this AgentBuddy doesn't have: importing leaves them out */
  unknownDatabases: string[];
  /** Stores its metadata lists with no folder to restore: empty when the backup was made, or lost since */
  missingDatabases: DatabaseName[];
  /**
   * Entity types in its primary database that no installed pack declares, with how many rows each has: a pack that
   * was installed when the backup was made and isn't now. Restoring keeps those rows, but nothing reads them until
   * that pack is back. Empty when the caller named no entity types to check against.
   */
  unknownEntityTypes: Array<[string, number]>;
}

/**
 * Checks the backup at `dir` restores into this app and reads what it holds: its metadata lists the primary database
 * (`lmdb`), which is there and opens (so a backup in another storage format is refused here, not half-way through an
 * import; the refusal names the AgentBuddy that made it when the backup recorded one). A listed database whose folder is missing was empty and is left out, as the import leaves it out, and one
 * this AgentBuddy doesn't have is reported as `unknownDatabases` for the caller to decide about. Throws naming what's
 * wrong. `entityTypes` are the types to count, and any type the backup holds that isn't among them comes back as
 * `unknownEntityTypes`.
 */
export function readBackup(dir: string, entityTypes: Iterable<string> = []): BackupContents {
  const metadataFile = path.join(dir, 'metadata.json');
  if (!fs.existsSync(metadataFile)) throw new Error(`${dir} isn't a backup: it has no metadata.json`);
  let metadata: { timestamp?: unknown; databases?: unknown; appVersion?: unknown; storageFormat?: unknown };
  try {
    metadata = fs.readJsonSync(metadataFile);
  } catch (error) {
    throw new Error(`${metadataFile} can't be read: ${(error as Error).message}`);
  }
  if (!Array.isArray(metadata.databases)) throw new Error(`${metadataFile} lists no databases`);
  const appVersion = typeof metadata.appVersion === 'string' ? metadata.appVersion : undefined;
  const unknownDatabases = metadata.databases.filter((name) => !isKnownDatabase(String(name))).map(String);
  const listed = metadata.databases.filter((name) => isKnownDatabase(String(name))) as DatabaseName[];
  const missingDatabases = listed.filter((name) => !fs.existsSync(path.join(dir, name, 'data.mdb')));
  if (!listed.includes('lmdb')) throw new Error("The backup doesn't include the database (lmdb)");
  // A listed database whose folder isn't there was empty when the backup was made, and the import skips it too
  const databases = listed.filter((name) => !missingDatabases.includes(name));
  if (!databases.includes('lmdb')) throw new Error(`The backup's lmdb folder is missing or has no data.mdb`);

  // Whether a backup can be restored is the files' answer, not the metadata's: a backup whose databases open is
  // restorable whatever metadata.json claims. What it recorded about its origin goes into the message, no more.
  const open = (name: DatabaseName) => {
    try {
      return openEnvAt(path.join(dir, name), { readOnly: true });
    } catch (error) {
      const made = appVersion ? ` (backup made by AgentBuddy ${appVersion})` : '';
      throw new Error(`${(error as Error).message}${made}`, { cause: error });
    }
  };
  // Every database the import would put in place, so one this version can't read is found before anything is
  // replaced, not when the store opens the new files again
  for (const name of databases.filter((name) => name !== 'lmdb')) closeEnv(open(name), () => {});
  const env = open('lmdb');
  try {
    const perType = new Map<string, number>();
    for (const { value } of env.entities.getRange() as Iterable<{ value: { type?: string } }>) {
      if (value.type) perType.set(value.type, (perType.get(value.type) ?? 0) + 1);
    }
    const known = new Set(entityTypes);
    const counts = [...known].sort()
      .flatMap((type) => (perType.has(type) ? [[type, perType.get(type)!] as [string, number]] : []));
    // With no types to check against there is nothing to call unknown, so an import that doesn't ask stays quiet
    const unknownEntityTypes = known.size === 0
      ? []
      : [...perType].filter(([type]) => !known.has(type)).sort(([a], [b]) => a.localeCompare(b));
    return {
      ...(typeof metadata.timestamp === 'number' && { timestamp: metadata.timestamp }),
      ...(appVersion !== undefined && { appVersion }),
      ...(typeof metadata.storageFormat === 'number' && { storageFormat: metadata.storageFormat }),
      databases,
      unknownDatabases,
      missingDatabases,
      unknownEntityTypes,
      hasMedia: fs.existsSync(path.join(dir, 'media')),
      counts,
    };
  } finally {
    closeEnv(env, () => {});
  }
}
