// abuddy db import | reset | clear-settings: commands that replace or delete data, and only list what they would
// change unless given --force
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EARS } from '@abuddy/ears';
import { importDatabase, readBackup } from '@abuddy/host/backup';
import type { AppDatabase } from '@abuddy/host/database';
import { createSecretsStore } from '@abuddy/host/secrets';
import { openTarget, parseDbArgs, TARGET_USAGE, withDatabase, type DbIo } from './target';

const FORCE = { force: { type: 'boolean', default: false } } as const;
const IMPORT_OPTIONS = { ...FORCE, 'skip-unknown': { type: 'boolean', default: false } } as const;
const FORCE_USAGE = '  --force                Make the change (without it, the command only lists it)';

const DRY_RUN = 'Dry run: nothing was changed. Run again with --force to make the change.';

/** Entities per type in the hydrated database, for the types that have some */
function entityCounts(db: AppDatabase): Array<[string, number]> {
  return [...db.schema.getRegisteredEntityTypes()].sort()
    .map((type) => [type, db.query.getEntitiesOfType(type as EARS.Entity).length] as [string, number])
    .filter(([, count]) => count > 0);
}

function countLines(counts: Array<[string, number]>): string[] {
  return counts.length > 0 ? counts.map(([type, count]) => `  ${type}: ${count}`) : ['  (no entities)'];
}

/** The stored API keys' file, whose keys a reset deletes; listing them needs no data key */
function secretsStoreAt(db: AppDatabase) {
  const refuse = () => { throw new Error('abuddy db never reads a key value'); };
  const vault = () => ({ backend: 'none', protection: 'unprotected' as const, get: refuse, set: refuse, delete: refuse });
  return createSecretsStore({ filePath: db.paths.secretsFile, osVault: vault, fileVault: vault });
}

// ── reset ────────────────────────────────────────────────────────────────

export const RESET_USAGE = [
  'Usage: abuddy db reset [--force] [options]',
  '',
  'Deletes all of the app\'s data, as Reset Database in the Database settings does: both database partitions and the',
  'stored API keys.',
  'AgentBuddy creates its default data again on its next start, and shows onboarding.',
  '',
  'Options:',
  FORCE_USAGE,
  TARGET_USAGE,
].join('\n');

export async function dbReset(args: string[], io: DbIo): Promise<void> {
  const { values, positionals, target } = parseDbArgs(args, FORCE, RESET_USAGE);
  if (positionals.length > 0) throw new Error(`Unexpected argument ${positionals[0]}\n\n${RESET_USAGE}`);
  const force = values.force as boolean;

  // Without --force nothing is changed, so the database opens read-only: a copy the user may not write is listed too
  const db = await openTarget(target, { write: force, command: 'reset' }, io);
  const done = await withDatabase(db, async () => {
    const secrets = secretsStoreAt(db);
    const keys = fs.existsSync(db.paths.secretsFile) ? secrets.list().length : 0;
    io.out(`${force ? 'Deleting' : 'Would delete'} the database (${db.paths.lmdb} and ${db.paths.volatileLmdb}):`);
    countLines(entityCounts(db)).forEach((line) => io.out(line));
    io.out(`  and the volatile partition (run history)`);
    io.out(`${force ? 'Deleting' : 'Would delete'} ${keys} stored API key(s)`);
    if (!force) {
      io.out(`\n${DRY_RUN}`);
      return null;
    }
    db.admin.clear();
    await db.store.reset();
    secrets.clearAll();
    return '\nReset. AgentBuddy creates its default data on its next start.';
  });
  if (done) io.out(done);
}

// ── clear-settings ───────────────────────────────────────────────────────

const SETTINGS_ENTITY = 'Settings';

export const CLEAR_SETTINGS_USAGE = [
  'Usage: abuddy db clear-settings [--force] [options]',
  '',
  'Destroys every Settings row; AgentBuddy recreates the default settings on its next start.',
  '',
  'Options:',
  FORCE_USAGE,
  TARGET_USAGE,
].join('\n');

export interface SettingsRow {
  id: string;
  label?: string;
  /** Top-level keys of its stored data (the user's changes from the defaults) */
  dataKeys: string[];
}

function describeSettingsRow(db: AppDatabase, id: EARS.EntityId): SettingsRow {
  const attributes = db.query.getAll(id);
  const data = attributes.data;
  return {
    id,
    ...(typeof attributes.label === 'string' && { label: attributes.label }),
    dataKeys: data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data) : [],
  };
}

export async function dbClearSettings(args: string[], io: DbIo): Promise<void> {
  const { values, positionals, target } = parseDbArgs(args, FORCE, CLEAR_SETTINGS_USAGE);
  if (positionals.length > 0) throw new Error(`Unexpected argument ${positionals[0]}\n\n${CLEAR_SETTINGS_USAGE}`);
  const force = values.force as boolean;

  // Without --force nothing is destroyed, so the database opens read-only
  const db = await openTarget(target, { write: force, command: 'clear-settings' }, io);
  const done = await withDatabase(db, () => {
    const rows = db.query.getEntitiesOfType(SETTINGS_ENTITY as EARS.Entity).map((id) => describeSettingsRow(db, id));
    if (rows.length === 0) {
      io.out('No Settings rows: nothing to destroy.');
      return null;
    }
    io.out(`${force ? 'Destroying' : 'Would destroy'} ${rows.length} Settings row(s):`);
    for (const row of rows) {
      io.out(`  ${row.id}${row.label ? `  label: ${row.label}` : ''}  stored keys: ${row.dataKeys.join(', ') || '(none)'}`);
    }
    if (!force) {
      io.out(`\n${DRY_RUN}`);
      return null;
    }
    for (const row of rows) db.query.tx(row.id as EARS.EntityId).destroy();
    return `\nDestroyed ${rows.length} Settings row(s). AgentBuddy recreates the defaults on its next start.`;
  });
  if (done) io.out(done);
}

// ── import ───────────────────────────────────────────────────────────────

export const IMPORT_USAGE = [
  'Usage: abuddy db import <backup-dir> [--force] [options]',
  '',
  'Replaces the database (and media) with a backup made in the Database settings\' Backup & Restore, after checking',
  'the backup opens. A backup from a newer AgentBuddy, holding stores this one doesn\'t have, is refused unless you',
  'say to leave those out.',
  '',
  'Options:',
  FORCE_USAGE,
  '  --skip-unknown         Import a newer AgentBuddy\'s backup without the stores this one doesn\'t have',
  TARGET_USAGE,
].join('\n');

export async function dbImport(args: string[], io: DbIo): Promise<void> {
  const { values, positionals, target } = parseDbArgs(args, IMPORT_OPTIONS, IMPORT_USAGE);
  if (positionals.length !== 1) throw new Error(`Name one backup directory\n\n${IMPORT_USAGE}`);
  const backupDir = path.resolve(positionals[0]);
  const force = values.force as boolean;

  // Without --force nothing is replaced, so the database opens read-only
  const db = await openTarget(target, { write: force, command: 'import' }, io);
  const done = await withDatabase(db, async () => {
    // The backup is checked before anything changes
    const backup = readBackup(backupDir, db.schema.getRegisteredEntityTypes());
    const skipUnknown = values['skip-unknown'] as boolean;
    if (backup.unknownDatabases.length > 0 && !skipUnknown) {
      throw new Error(
        `The backup also holds ${backup.unknownDatabases.join(', ')}, which this AgentBuddy doesn't have: it was made by a newer ` +
        'one, and importing it would replace your data with an incomplete copy. Run again with --skip-unknown to import it without those.',
      );
    }
    io.out(`Backup: ${backupDir}`);
    if (backup.timestamp) io.out(`  made ${new Date(backup.timestamp).toISOString()}`);
    io.out(`  databases: ${backup.databases.join(', ')}${backup.hasMedia ? ', with media' : ''}`);
    if (backup.unknownDatabases.length > 0) io.out(`  leaving out ${backup.unknownDatabases.join(', ')}, which this AgentBuddy doesn't have`);
    countLines(backup.counts).forEach((line) => io.out(line));
    io.out(`${force ? 'Replacing' : 'Would replace'} the current database, which holds:`);
    countLines(entityCounts(db)).forEach((line) => io.out(line));
    if (backup.hasMedia) io.out(`${force ? 'Replacing' : 'Would replace'} ${db.paths.media}`);
    if (!force) {
      io.out(`\n${DRY_RUN}`);
      return null;
    }
    db.admin.clear();
    await importDatabase(db.store, backupDir, db.paths.media, { skipUnknownDatabases: skipUnknown });
    return '\nImported.';
  });
  if (done) io.out(done);
}
