// What every `abuddy db` command shares: the data dir it targets, and opening its database offline
import * as path from 'node:path';
import { parseArgs, type ParseArgsConfig } from 'node:util';
import { resolveAppContext, type AppContext, type AppEnv } from '@abuddy/sdk/env';
import { findRunningApp, holdDatabaseWriteLock, openAppDatabase, type AppDatabase } from '@abuddy/host/database';
import { EARS } from '@abuddy/sdk/types';
import type { ConsoleScope } from '@abuddy/sdk/database-console';

/** Where a command's lines go: results on stdout, what it targets and warnings on stderr */
export interface DbIo {
  out(text: string): void;
  err(text: string): void;
}

export const processIo: DbIo = {
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
};

const TARGET_OPTIONS = {
  dev: { type: 'boolean', short: 'd', default: false },
  beta: { type: 'boolean', short: 'b', default: false },
  production: { type: 'boolean', default: false },
  'data-dir': { type: 'string' },
} satisfies ParseArgsConfig['options'];

export const TARGET_USAGE = [
  '  -d, --dev              The development app\'s data',
  '  -b, --beta             The beta app\'s data',
  '  --production           The production app\'s data (what a command that only reads takes by default)',
  '  --data-dir <path>      A data dir, a copy of the user\'s for instance',
].join('\n');

export type DbTarget = Pick<AppContext, 'env' | 'userDataDir' | 'apiPortFile'> & {
  /** The command named this data dir (`-d`, `-b`, `--production` or `--data-dir`) rather than taking the default */
  named: boolean;
};

/**
 * The command's options, its positionals and the data dir it targets. Unknown options throw, with the command's
 * usage.
 */
export function parseDbArgs<O extends NonNullable<ParseArgsConfig['options']>>(args: string[], options: O, usage: string) {
  let parsed;
  try {
    parsed = parseArgs({ args, options: { ...TARGET_OPTIONS, ...options }, allowPositionals: true, strict: true });
  } catch (error) {
    throw new Error(`${(error as Error).message}\n\n${usage}`);
  }
  const { dev, beta, production, 'data-dir': dataDir } = parsed.values as
    { dev: boolean; beta: boolean; production: boolean; 'data-dir'?: string };
  // An empty --data-dir would otherwise read as "no data dir given" and target the default one
  if (dataDir !== undefined && dataDir.trim() === '') throw new Error(`--data-dir needs a path\n\n${usage}`);
  const named = [dev && '-d', beta && '-b', production && '--production', dataDir !== undefined && '--data-dir'].filter(Boolean) as string[];
  if (named.length > 1) throw new Error(`Name one data dir, not ${named.length}: ${named.join(', ')}\n\n${usage}`);
  const env: AppEnv = beta ? 'beta' : dev ? 'development' : 'production';
  const context = resolveAppContext({ env, ...(dataDir !== undefined && { userDataDir: path.resolve(dataDir) }) });
  const target: DbTarget = { env, userDataDir: context.userDataDir, apiPortFile: context.apiPortFile, named: named.length === 1 };
  return { values: parsed.values as typeof parsed.values & Record<keyof O, unknown>, positionals: parsed.positionals, target };
}

export interface OpenOptions {
  /** The command changes the database: refused while an app runs on the data dir */
  write: boolean;
  /** The command's name, for the lock a change holds */
  command: string;
}

/**
 * Opens the target's database offline, after printing which data dir it is. A command that changes the database says
 * which data dir it means, so the production app's data is never the one a forgotten flag hits, and is refused while
 * an app runs on that data dir, which holds the database in memory and would overwrite the change or lose it; a read
 * warns that it may miss what the app hasn't written yet.
 */
export async function openTarget(target: DbTarget, { write, command }: OpenOptions, io: DbIo): Promise<AppDatabase> {
  if (write && !target.named) {
    throw new Error('Name the data dir to change: --production, -d, -b, or --data-dir <path>');
  }
  io.err(`Database: ${target.userDataDir} (offline)`);
  // Taken before the check, so an app that starts from here on finds it and refuses to open the database
  const lock = write ? holdDatabaseWriteLock(target.userDataDir, `abuddy db ${command}`) : null;
  try {
    const running = await findRunningApp(target);
    if (running && write) {
      throw new Error(`AgentBuddy is running on ${target.userDataDir} (${running}): quit it first, this command changes its database`);
    }
    if (running) io.err(`Warning: AgentBuddy is running on it (${running}); what it hasn't written yet isn't here`);
    const db = await openAppDatabase({
      env: target.env,
      userDataDir: target.userDataDir,
      readOnly: !write,
      log: () => {},
    });
    return lock ? { ...db, close: () => { try { db.close(); } finally { lock.release(); } } } : db;
  } catch (error) {
    lock?.release();
    throw error;
  }
}

/** `EARS` for console code: the SDK's, with the installed packs' entity types and relation kinds */
export function consoleScope(db: AppDatabase): ConsoleScope {
  return { EARS: { ...EARS, Entity: db.schema.entities, RelKind: { ...db.schema.relKinds, Custom: EARS.RelKind.Custom } } };
}
