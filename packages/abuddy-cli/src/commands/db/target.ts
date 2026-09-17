// What every `abuddy db` command shares: the data dir it targets, and opening its database offline
import * as path from 'node:path';
import { parseArgs, type ParseArgsConfig } from 'node:util';
import { resolveAppContext, type AppContext, type AppEnv } from '@abuddy/sdk/env';
import { findRunningApp, openAppDatabase, type AppDatabase } from '@abuddy/host/database';
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
  'data-dir': { type: 'string' },
} satisfies ParseArgsConfig['options'];

export const TARGET_USAGE = [
  '  -d, --dev              The development app\'s data',
  '  -b, --beta             The beta app\'s data',
  '  --data-dir <path>      A data dir, a copy of the user\'s say (default: the production app\'s data)',
].join('\n');

export type DbTarget = Pick<AppContext, 'env' | 'userDataDir' | 'apiPortFile'>;

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
  const { dev, beta, 'data-dir': dataDir } = parsed.values as { dev: boolean; beta: boolean; 'data-dir'?: string };
  if (dev && beta) throw new Error(`Choose one of -d and -b\n\n${usage}`);
  const env: AppEnv = beta ? 'beta' : dev ? 'development' : 'production';
  const context = resolveAppContext({ env, ...(dataDir && { userDataDir: path.resolve(dataDir) }) });
  const target: DbTarget = { env, userDataDir: context.userDataDir, apiPortFile: context.apiPortFile };
  return { values: parsed.values as typeof parsed.values & Record<keyof O, unknown>, positionals: parsed.positionals, target };
}

export interface OpenOptions {
  /** The command changes the database: refused while an app runs on the data dir */
  write: boolean;
}

/**
 * Opens the target's database offline, after printing which data dir it is. A command that writes is refused while
 * an app runs on the data dir, which holds the database in memory and would overwrite the change or lose it; a read
 * warns that it may miss what the app hasn't written yet.
 */
export async function openTarget(target: DbTarget, { write }: OpenOptions, io: DbIo): Promise<AppDatabase> {
  io.err(`Database: ${target.userDataDir} (offline)`);
  const running = await findRunningApp(target);
  if (running && write) {
    throw new Error(`AgentBuddy is running on ${target.userDataDir} (${running}): quit it first, this command changes its database`);
  }
  if (running) io.err(`Warning: AgentBuddy is running on it (${running}); what it hasn't written yet isn't here`);
  return openAppDatabase({
    env: target.env,
    userDataDir: target.userDataDir,
    readOnly: !write,
    log: () => {},
  });
}

/** `EARS` for console code: the SDK's, with the installed packs' entity types and relation kinds */
export function consoleScope(db: AppDatabase): ConsoleScope {
  return { EARS: { ...EARS, Entity: db.schema.entities, RelKind: { ...db.schema.relKinds, Custom: EARS.RelKind.Custom } } };
}
