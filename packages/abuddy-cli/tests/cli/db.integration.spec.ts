// abuddy db, offline, against temp data dirs: each command's output and changes, the refusals while an app runs on the
// data dir, and the dry runs of the commands that replace or delete data
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { spawn, spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { installEngine, installedEngine, untypedTx, type EARS } from '@abuddy/ears';
import { findDatabaseWriter, holdDatabaseWriteLock, openDatabaseStore, readInstalledSchema } from '@abuddy/host/database';
import { exportDatabase } from '@abuddy/host/backup';
import { closeEnv, openEnvAt } from '@abuddy/ears/lmdb';
import { createSecretsStore, memoryKeyVault } from '@abuddy/host/secrets';
import { _appDataPaths } from '@abuddy/sdk/utils';
import { appDataDirFor, resolveAppContext } from '@abuddy/sdk/env';
import { db } from '../../src/commands/db';
import { parseDbArgs } from '../../src/commands/db/target';
import { dbRepl } from '../../src/commands/db/repl';

const DEFAULT_SETUP_SNAPSHOT = path.resolve(import.meta.dirname, '..', '..', '..', 'default-setup', 'dist', 'snapshot.json');

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const id = (name: string) => name as EARS.EntityId;

function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function schemaContext(userDataDir: string) {
  return {
    userDataDir,
    packsDir: path.join(userDataDir, 'packs'),
    hostPacksDir: path.join(userDataDir, 'host-packs'),
    installedPacksFile: path.join(userDataDir, 'installed-packs.json'),
  };
}

/** Writes to the data dir's database as the app does (default-setup published, source layout) */
async function write(userDataDir: string, change: () => void): Promise<void> {
  const paths = _appDataPaths(userDataDir, { packaged: false });
  const { store, engine } = openDatabaseStore({
    paths: { primary: paths.lmdb, volatileBackup: paths.volatileLmdb },
    schema: readInstalledSchema(schemaContext(userDataDir)),
    log: () => {},
  });
  installEngine(engine.query);
  try {
    await store.hydrate();
    change();
  } finally {
    installEngine(undefined);
    store.close();
  }
}

/** A data dir the app ran on: default-setup published, its state, settings, and notes with a relation and a role */
async function appDataDir(): Promise<string> {
  const dir = tempDir('abuddy-db-');
  const snapshot = path.join(dir, 'host-packs', 'default-setup', 'types', 'snapshot.json');
  fs.mkdirSync(path.dirname(snapshot), { recursive: true });
  fs.copyFileSync(DEFAULT_SETUP_SNAPSHOT, snapshot);
  await write(dir, () => {
    untypedTx(id('AppState-app'), true).put('entityType', 'AppState').put('hasOnboarded', true);
    untypedTx(id('Settings-app'), true).put('entityType', 'Settings').put('label', 'App').put('data', { general: { theme: 'dark' } });
    untypedTx(id('Note-a'), true).put('entityType', 'Note').put('title', 'Alpha').grant('pinned').link('parent_of', id('Note-b'));
    untypedTx(id('Note-b'), true).put('entityType', 'Note').put('title', 'Beta, "quoted"');
    // The run history, which the app keeps in its own partition (TNode is excluded from the main one)
    untypedTx(id('TNode-1'), true).put('entityType', 'TNode').put('status', 'completed');
  });
  return dir;
}

/** A backup of a data dir, as the app exports it */
async function backupOf(userDataDir: string, { withMedia = false, databases }: { withMedia?: boolean; databases?: Array<'lmdb' | 'volatileLmdb'> } = {}): Promise<string> {
  const paths = _appDataPaths(userDataDir, { packaged: false });
  if (withMedia) {
    fs.mkdirSync(paths.media, { recursive: true });
    fs.writeFileSync(path.join(paths.media, 'image.png'), 'png');
  }
  const log = { info: () => {}, warn: () => {} };
  // Through an open store, as the app backs up: LMDB copies each database itself
  const { store } = openDatabaseStore({
    paths: { primary: paths.lmdb, volatileBackup: paths.volatileLmdb },
    schema: readInstalledSchema(schemaContext(userDataDir)),
    // Read-only: LMDB copies a database whose files this user can't write just as well
    readOnly: true,
    log: () => {},
  });
  try {
    return await exportDatabase(store, tempDir('backup-'), { name: 'backup', mediaPath: paths.media, appVersion: '0.3.14', log, ...(databases && { databases }) });
  } finally {
    store.close();
  }
}

/** Records another storage format in a database's own files, as a newer AgentBuddy would have written them */
function writeStorageFormat(databaseDir: string, format: number): void {
  const env = openEnvAt(databaseDir);
  try {
    env.root.openDB({ name: 'meta', encoding: 'json' }).putSync('format', format);
  } finally {
    closeEnv(env, () => {});
  }
}

/** Runs `abuddy db <args>` and returns its stdout and stderr lines, and its error */
async function run(args: string[]): Promise<{ out: string; err: string; error?: Error }> {
  const out: string[] = [];
  const err: string[] = [];
  let error: Error | undefined;
  try {
    await db(args, { out: (line) => out.push(line), err: (line) => err.push(line) });
  } catch (caught) {
    error = caught as Error;
  }
  return { out: out.join('\n'), err: err.join('\n'), error };
}

async function ok(args: string[]) {
  const result = await run(args);
  if (result.error) throw result.error;
  return result;
}

/** What a running app publishes in its data dir, which `abuddy db` refuses to write under */
const holdLock = (dir: string) =>
  fs.writeFileSync(path.join(dir, 'app.lock'), JSON.stringify({ pid: process.pid, machine: os.hostname(), since: new Date().toISOString() }));

/** What a running API publishes: its port and its process */
function publishApi(dir: string): void {
  fs.writeFileSync(path.join(dir, 'api-port'), JSON.stringify({ port: 3001, pid: process.pid }));
}

describe('abuddy db query', () => {
  it('prints the result, after the data dir it targets', async () => {
    const dir = await appDataDir();
    const { out, err } = await ok(['query', "return qx(EARS.Entity.Note).pickAll(['title']).map((n) => n.title).sort()", '--data-dir', dir, '-o', 'json']);
    expect(JSON.parse(out)).toEqual(['Alpha', 'Beta, "quoted"']);
    expect(err).toContain(`Database: ${dir} (offline)`);
    // The engine is closed and uninstalled
    expect(() => installedEngine()).toThrow();
  });

  it('reads code from a file, and writes CSV to a file', async () => {
    const dir = await appDataDir();
    const code = path.join(dir, 'query.js');
    fs.writeFileSync(code, "return qx(EARS.Entity.Note).pickAll().map(({ id, title }) => ({ id, title })).sort((a, b) => a.id.localeCompare(b.id))");
    const csv = path.join(dir, 'out', 'notes.csv');
    const { out, err } = await ok(['query', '--file', code, '--data-dir', dir, '--output', 'csv', '--out', csv]);
    expect(out).toBe('');
    expect(err).toContain(`Wrote ${csv}`);
    expect(fs.readFileSync(csv, 'utf-8')).toBe('id,title\nNote-a,Alpha\nNote-b,"Beta, ""quoted"""\n');
  });

  it("can't write, and changes nothing", async () => {
    const dir = await appDataDir();
    const { error } = await run(['query', "tx('Note-a').put('title', 'changed')", '--data-dir', dir]);
    expect(error?.message).toBe('tx is not defined');
    const { out } = await ok(['query', "return getAttr('Note-a', 'title')", '--data-dir', dir]);
    expect(out).toBe('Alpha');
  });

  it('reads data whose files it may not write', async () => {
    const dir = await appDataDir();
    const { lmdb, volatileLmdb } = _appDataPaths(dir, { packaged: false });
    const files = [lmdb, volatileLmdb].flatMap((db) => fs.readdirSync(db).map((file) => path.join(db, file)));
    for (const file of files) fs.chmodSync(file, 0o444);
    try {
      const { out } = await ok(['query', "return getAttr('Note-a', 'title')", '--data-dir', dir]);
      expect(out).toBe('Alpha');
    } finally {
      for (const file of files) fs.chmodSync(file, 0o644);
    }
  });

  it('warns while an app runs on the data dir, and still reads', async () => {
    const dir = await appDataDir();
    holdLock(dir);
    const { out, err } = await ok(['query', 'return getSchemaStats().entities.Note', '--data-dir', dir]);
    expect(out).toBe('2');
    expect(err).toMatch(/Warning: AgentBuddy is running on it \(its process is running \(pid \d+\)\)/);
  });

  it('refuses bad arguments with its usage', async () => {
    const dir = await appDataDir();
    expect((await run(['query', '--data-dir', dir])).error?.message).toMatch(/^No code to run\n\nUsage: abuddy db query/);
    expect((await run(['query', 'return 1', '--nope'])).error?.message).toMatch(/Unknown option '--nope'[\s\S]*Usage: abuddy db query/);
    expect((await run(['query', 'return 1', '-o', 'xml', '--data-dir', dir])).error?.message).toBe('--output must be one of pretty, json, csv');
    expect((await run(['query', 'return 1', '-d', '-b'])).error?.message).toMatch(/^Name one data dir, not 2: -d, -b/);
    expect((await run(['query', 'return 1', '--data-dir', tempDir('empty-')])).error?.message).toMatch(/^No AgentBuddy database in /);
  });
});

describe('naming the data dir', () => {
  it('refuses an empty --data-dir rather than falling back to the default data dir', async () => {
    const dir = await appDataDir();
    process.env.ABUDDY_USER_DATA_DIR = dir;
    try {
      for (const args of [['query', 'return 1', '--data-dir='], ['query', 'return 1', '--data-dir', '']]) {
        const { error, err } = await run(args);
        expect(error?.message).toMatch(/^--data-dir needs a path\n\nUsage: abuddy db query/);
        expect(err).toBe('');
      }
    } finally {
      delete process.env.ABUDDY_USER_DATA_DIR;
    }
  });

  // Which app's data each flag means, without opening it: the flag that picks the data dir a change deletes is
  // worth pinning by itself. parseDbArgs resolves it, so no test has to touch a real data dir to check
  it('resolves each flag to that app\'s data dir, and --data-dir to the path given', () => {
    const wasSet = process.env.ABUDDY_USER_DATA_DIR;
    delete process.env.ABUDDY_USER_DATA_DIR;
    try {
      const targetOf = (args: string[]) => parseDbArgs(args, {}, 'usage').target;
      for (const [args, env] of [[[], 'production'], [['--production'], 'production'], [['-d'], 'development'], [['-b'], 'beta']] as const) {
        const target = targetOf([...args]);
        expect(target.env, args.join(' ') || '(no flag)').toBe(env);
        expect(target.userDataDir, args.join(' ') || '(no flag)').toBe(resolveAppContext({ env }).userDataDir);
      }
      // Each names a different app's data, so a swap between them can't pass
      const dirs = [[], ['-d'], ['-b']].map((args) => targetOf(args).userDataDir);
      expect(new Set(dirs).size).toBe(3);

      const given = path.join(os.tmpdir(), 'abuddy-db-target');
      expect(targetOf(['--data-dir', given])).toMatchObject({ userDataDir: given, named: true });
      expect(targetOf([]).named).toBe(false);
    } finally {
      if (wasSet !== undefined) process.env.ABUDDY_USER_DATA_DIR = wasSet;
    }
  });

  // The variable is how the repo's db:* scripts and these tests point at a temp data dir, so it still applies when
  // nothing names an app; a flag that does name one means that app's data, not whatever the shell points at
  it('takes a named data dir over ABUDDY_USER_DATA_DIR, and takes the variable when nothing is named', () => {
    const dir = tempDir('abuddy-db-env-');
    const fromEnv = path.join(os.tmpdir(), 'abuddy-db-from-env');
    process.env.ABUDDY_USER_DATA_DIR = fromEnv;
    try {
      expect(parseDbArgs(['--data-dir', dir], {}, 'usage').target.userDataDir).toBe(dir);
      // The app's own data dir, which is what resolveAppContext gives when the variable isn't set
      for (const [args, env] of [[['-d'], 'development'], [['-b'], 'beta'], [['--production'], 'production']] as const) {
        expect(parseDbArgs([...args], {}, 'usage').target.userDataDir, args.join(' ')).toBe(appDataDirFor(env));
      }
      expect(parseDbArgs([], {}, 'usage').target.userDataDir).toBe(fromEnv);
    } finally {
      delete process.env.ABUDDY_USER_DATA_DIR;
    }
  });

  it('refuses two data dirs', async () => {
    const dir = await appDataDir();
    expect((await run(['query', 'return 1', '-d', '--data-dir', dir])).error?.message).toMatch(/^Name one data dir, not 2: -d, --data-dir/);
    expect((await run(['query', 'return 1', '--production', '--data-dir', dir])).error?.message).toMatch(/^Name one data dir, not 2: --production, --data-dir/);
    expect((await run(['reset', '-b', '--production'])).error?.message).toMatch(/^Name one data dir, not 2: -b, --production/);
  });

  it('makes a command that changes the database name its data dir, and opens none until it does', async () => {
    const dir = await appDataDir();
    const changes = [['exec', 'return 1'], ['reset', '--force'], ['clear-settings', '--force'], ['import', dir, '--force'], ['repl', '--write']];
    for (const args of changes) {
      const { error, err, out } = await run(args);
      expect(error?.message, args.join(' ')).toBe('Name the data dir to change: --production, -d, -b, or --data-dir <path>');
      expect(`${err}${out}`).toBe('');
    }
  });

  it('lets a command that only reads take the production app\'s data without being told, dry runs included', async () => {
    const dir = await appDataDir();
    process.env.ABUDDY_USER_DATA_DIR = dir;
    try {
      expect((await ok(['query', 'return 1'])).err).toContain(`Database: ${dir} (offline)`);
      // A dry run reads: it lists what --force would delete
      expect((await ok(['reset'])).out).toContain('Would delete the database');
      expect((await ok(['clear-settings'])).out).toContain('Would destroy 1 Settings row(s)');
    } finally {
      delete process.env.ABUDDY_USER_DATA_DIR;
    }
  });

  // --production names the real production app's data, which no test may open, so the write goes to a named dir
  it('names a data dir for a change, and writes what the code returns to it', async () => {
    const dir = await appDataDir();
    process.env.ABUDDY_USER_DATA_DIR = dir;
    try {
      expect(parseDbArgs(['--production'], {}, 'usage').target.userDataDir).toBe(appDataDirFor('production'));

      const { out, err } = await ok(['exec', "tx('Note-a').put('title', 'Named')", '--data-dir', dir]);
      expect(err).toContain(`Database: ${dir} (offline)`);
      expect(out).toBe('undefined');
      expect((await ok(['query', "return getAttr('Note-a', 'title')", '--data-dir', dir])).out).toBe('Named');
    } finally {
      delete process.env.ABUDDY_USER_DATA_DIR;
    }
  });
});

describe('the lock a change holds', () => {
  /** What holds the data dir's database while `command` runs, and what holds it after */
  async function writerDuring(args: string[], dir: string) {
    const running = ok(args);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const during = findDatabaseWriter(dir);
    await running;
    return { during, after: findDatabaseWriter(dir) };
  }

  const slowCode = 'return new Promise((resolve) => setTimeout(() => resolve(1), 60))';

  it('is held while a change runs and released after, so an app that starts meanwhile refuses to open the database', async () => {
    const dir = await appDataDir();
    expect(await writerDuring(['exec', slowCode, '--data-dir', dir], dir))
      .toEqual({ during: `abuddy db exec (pid ${process.pid})`, after: null });
  });

  it('is not taken by a command that only reads', async () => {
    const dir = await appDataDir();
    expect(await writerDuring(['query', slowCode, '--data-dir', dir], dir)).toEqual({ during: null, after: null });
  });

  it('refuses a second command, and is released when one fails', async () => {
    const dir = await appDataDir();
    const held = holdDatabaseWriteLock(dir, 'abuddy db import');
    try {
      const { error } = await run(['reset', '--force', '--data-dir', dir]);
      expect(error?.message).toBe(
        `Another tool is changing the database in ${dir}: abuddy db import (pid ${process.pid}). ` +
        `If no tool is running, delete ${path.join(dir, 'db-write.lock')} and try again.`,
      );
    } finally {
      held.release();
    }
    // A command whose code throws still releases it
    expect((await run(['exec', 'throw new Error("boom")', '--data-dir', dir])).error?.message).toMatch(/boom/);
    expect(findDatabaseWriter(dir)).toBeNull();
    // So does one refused because an app is running
    holdLock(dir);
    expect((await run(['exec', 'return 1', '--data-dir', dir])).error?.message).toMatch(/quit it first/);
    expect(findDatabaseWriter(dir)).toBeNull();
  });
});

describe('the run history', () => {
  it('is left out until --volatile asks for it, in queries, exports and what a reset would delete', async () => {
    const dir = await appDataDir();
    const counted = "return [getEntitiesOfType('TNode').length, getEntitiesOfType('Note').length]";
    expect(JSON.parse((await ok(['query', counted, '--data-dir', dir, '-o', 'json'])).out)).toEqual([0, 2]);
    expect(JSON.parse((await ok(['query', counted, '--data-dir', dir, '-o', 'json', '--volatile'])).out)).toEqual([1, 2]);

    const out = path.join(dir, 'export');
    await ok(['export', '--out', out, '--data-dir', dir, '--volatile']);
    expect(JSON.parse(fs.readFileSync(path.join(out, 'TNode.json'), 'utf-8'))).toEqual([expect.objectContaining({ id: 'TNode-1', status: 'completed' })]);

    expect((await ok(['reset', '--data-dir', dir, '--volatile'])).out).toContain('  TNode: 1');
    expect((await ok(['reset', '--data-dir', dir])).out).not.toContain('TNode');
  });

  it('is deleted by a reset either way', async () => {
    const dir = await appDataDir();
    await ok(['reset', '--force', '--data-dir', dir]);
    expect(JSON.parse((await ok(['query', "return getAllEntities()", '--data-dir', dir, '-o', 'json', '--volatile'])).out)).toEqual([]);
  });
});

describe('abuddy db exec', () => {
  it('writes with the transaction helpers', async () => {
    const dir = await appDataDir();
    const { out } = await ok(['exec', "tx('Note-a').put('title', 'Changed'); return tx(EARS.Entity.Note).put('title', 'New').id()", '--data-dir', dir]);
    expect(out).toMatch(/^Note-/);
    const titles = await ok(['query', "return qx(EARS.Entity.Note).pickAll(['title']).map((n) => n.title).sort()", '--data-dir', dir, '-o', 'json']);
    expect(JSON.parse(titles.out)).toEqual(['Beta, "quoted"', 'Changed', 'New']);
  });

  it('refuses while an app holds the data dir or its API answers, changing nothing', async () => {
    const locked = await appDataDir();
    holdLock(locked);
    const byLock = await run(['exec', "tx('Note-a').put('title', 'Changed')", '--data-dir', locked]);
    expect(byLock.error?.message).toMatch(/^AgentBuddy is running on .* \(its process is running \(pid \d+\)\): quit it first/);
    // The marker outlives a crash and its pid can be one the OS has since reused, so the refusal has to
    // name the file: without it the data dir is one no tool could ever write to again
    expect(byLock.error?.message, 'the refusal gave no way out').toContain(`delete ${path.join(locked, 'app.lock')}`);

    const served = await appDataDir();
    publishApi(served);
    const byPort = await run(['exec', "tx('Note-a').put('title', 'Changed')", '--data-dir', served]);
    expect(byPort.error?.message).toMatch(new RegExp(`its API is running on port 3001 \\(pid ${process.pid}\\)`));
    const { out } = await ok(['query', "return getAttr('Note-a', 'title')", '--data-dir', served]);
    expect(out).toBe('Alpha');
  });

  it('fails when a write never reaches the files', async () => {
    const dir = await appDataDir();
    const { error } = await run(['exec', "tx('Note-a').put('count', 1n)", '--data-dir', dir]);
    expect(error?.message).toMatch(/1 write\(s\) didn't reach the database/);
  });

  it('keeps what the code wrote before it threw: there is no rollback', async () => {
    const dir = await appDataDir();
    const { error } = await run(['exec', "tx('Note-a').put('title', 'Written'); throw new Error('boom')", '--data-dir', dir]);
    expect(error?.message).toBe('Transaction failed: boom\n  The writes it made before failing stand: nothing is rolled back.');
    // The code runs as one function, not one transaction: what it wrote before throwing is flushed on close
    const { out } = await ok(['query', "return getAttr('Note-a', 'title')", '--data-dir', dir]);
    expect(out).toBe('Written');
  });

  it("reports the code's own error first when closing fails too", async () => {
    const dir = await appDataDir();
    // The code writes a value LMDB can't store, then throws
    const { error } = await run(['exec', "tx('Note-a').put('count', 1n); throw new Error('boom')", '--data-dir', dir]);
    expect(error?.message).toMatch(/^Transaction failed: boom\n  The writes it made before failing stand[^\n]*\n  The database also failed to close: 1 write\(s\) didn't reach the database/);
    expect((error as Error).cause).toBeInstanceOf(Error);
  });
});

describe('abuddy db repl', () => {
  it('runs each line, reporting errors without stopping', async () => {
    const dir = await appDataDir();
    const out: string[] = [];
    const err: string[] = [];
    const input = Readable.from(["return getAttr('Note-a', 'title')\n", "tx('Note-a')\n", '\n', 'return 2\n', '.exit\n', 'return 3\n']);
    await dbRepl(['--data-dir', dir], { out: (l) => out.push(l), err: (l) => err.push(l) }, input);
    expect(out).toEqual(['Alpha', '2']);
    expect(err).toContain('Error: tx is not defined');
  });

  it('refuses a --write session while an app runs on the data dir, changing nothing', async () => {
    const dir = await appDataDir();
    holdLock(dir);
    const io = { out: () => {}, err: () => {} };
    const input = Readable.from(["tx('Note-a').put('title', 'From the repl')\n"]);
    await expect(dbRepl(['--data-dir', dir, '--write'], io, input)).rejects
      .toThrow(/^AgentBuddy is running on .* \(its process is running \(pid \d+\)\): quit it first/);
    const { out } = await ok(['query', "return getAttr('Note-a', 'title')", '--data-dir', dir]);
    expect(out).toBe('Alpha');
  });

  it('reads while an app runs, warning as the other commands do', async () => {
    const dir = await appDataDir();
    holdLock(dir);
    const out: string[] = [];
    const err: string[] = [];
    const input = Readable.from(["return getAttr('Note-a', 'title')\n"]);
    await dbRepl(['--data-dir', dir], { out: (l) => out.push(l), err: (l) => err.push(l) }, input);
    expect(out).toEqual(['Alpha']);
    expect(err.join('\n')).toMatch(/Warning: AgentBuddy is running on it/);
  });

  it('saves the writes of a --write session', async () => {
    const dir = await appDataDir();
    const io = { out: () => {}, err: () => {} };
    await dbRepl(['--data-dir', dir, '--write'], io, Readable.from(["tx('Note-a').put('title', 'From the repl')\n"]));
    const { out } = await ok(['query', "return getAttr('Note-a', 'title')", '--data-dir', dir]);
    expect(out).toBe('From the repl');
  });
});

describe('abuddy db script', () => {
  /** A script file in the data dir, so it is cleaned up with it */
  function writeScript(dir: string, name: string, source: string): string {
    const file = path.join(dir, name);
    fs.writeFileSync(file, source);
    return file;
  }

  // A script that awaits anything must finish before the command reports success: it used to exit early
  // and say it worked, so an export wrote a truncated file and a prompt was never answered. Driven
  // through the binary on purpose — in-process the command is just awaited, and a premature
  // `process.exit` is exactly what an in-process call cannot catch.
  it('waits for a script that awaits, before the process exits', async () => {
    const dir = await appDataDir();
    const marker = path.join(dir, 'finished.txt');
    const file = writeScript(dir, 'slow.ts', [
      "import * as fs from 'node:fs';",
      'export default async ({ log }: any) => {',
      "  log('started');",
      '  await new Promise((resolve) => setTimeout(resolve, 400));',
      `  fs.writeFileSync(${JSON.stringify(marker)}, 'finished');`,
      "  return 'done';",
      '};',
    ].join('\n'));

    const cli = path.resolve(import.meta.dirname, '..', '..', 'bin', 'abuddy.mjs');
    const run = spawnSync(process.execPath, [cli, 'db', 'script', file, '--data-dir', dir], { encoding: 'utf-8' });
    expect(run.status, run.stderr).toBe(0);
    expect(fs.existsSync(marker), 'the script finished before the process exited').toBe(true);
    expect(run.stdout.trim().split('\n')).toEqual(['started', 'done']);
  });

  it('runs a file with the open database, its arguments and a printer, and prints what it returns', async () => {
    const dir = await appDataDir();
    const file = writeScript(dir, 'rename.ts', [
      "import * as os from 'node:os';",
      'export default async ({ db, EARS, args, log }: any) => {',
      "  log(`renaming on ${typeof os.hostname()}`);",
      "  db.query.tx('Note-a').put('title', args[0]);",
      '  return db.query.getEntitiesOfType(EARS.Entity.Note).length;',
      '};',
    ].join('\n'));

    const { out } = await ok(['script', file, '--data-dir', dir, '--', 'From a script']);
    expect(out.split('\n')).toEqual(['renaming on string', '2']);
    expect((await ok(['query', "return getAttr('Note-a', 'title')", '--data-dir', dir])).out).toBe('From a script');
  });

  it('runs a plain module too, and writes what it returns to a file', async () => {
    const dir = await appDataDir();
    const file = writeScript(dir, 'titles.mjs', [
      'export default ({ db }) => db.query.getEntitiesOfType("Note").map((id) => ({ id, title: db.query.getAttr(id, "title") }));',
    ].join('\n'));
    const out = path.join(dir, 'titles.json');
    await ok(['script', file, '--data-dir', dir, '-o', 'json', '--out', out]);
    expect(JSON.parse(fs.readFileSync(out, 'utf-8')).map((row: { title: string }) => row.title).sort()).toEqual(['Alpha', 'Beta, "quoted"']);
  });

  it('runs a TypeScript script through the real CLI, with its own imports, as a user does', async () => {
    const dir = await appDataDir();
    writeScript(dir, 'helper.ts', "export const titleOf = (db: any, id: string): string => db.query.getAttr(id, 'title');");
    const file = writeScript(dir, 'report.ts', [
      "import { titleOf } from './helper';",
      'export default ({ db, args }: any) => ({ title: titleOf(db, args[0]), notes: db.query.getEntitiesOfType("Note").length });',
    ].join('\n'));

    // In this process vitest compiles the script; the CLI has to do it itself, so drive the binary
    const cli = path.resolve(import.meta.dirname, '..', '..', 'bin', 'abuddy.mjs');
    const compiledDirs = () => fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('abuddy-db-script-'));
    const before = compiledDirs();
    const run = spawnSync(process.execPath, [cli, 'db', 'script', file, '--data-dir', dir, '-o', 'json', '--', 'Note-a'], { encoding: 'utf-8' });
    expect(run.stderr).toContain(`Database: ${dir} (offline)`);
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual({ title: 'Alpha', notes: 2 });
    // Nothing is left behind: not beside the script, not in the temp dir it compiled to
    expect(fs.readdirSync(dir).filter((name) => name.endsWith('.mjs'))).toEqual([]);
    expect(compiledDirs()).toEqual(before);
  });

  it("runs a script in a directory it can't write, importing a package from beside it", async () => {
    const dir = await appDataDir();
    const scripts = path.join(dir, 'read-only-scripts');
    fs.mkdirSync(path.join(scripts, 'node_modules', 'greet'), { recursive: true });
    fs.writeFileSync(path.join(scripts, 'node_modules', 'greet', 'package.json'), JSON.stringify({ name: 'greet', version: '1.0.0', type: 'module', main: 'index.js' }));
    fs.writeFileSync(path.join(scripts, 'node_modules', 'greet', 'index.js'), 'export const greet = (name) => `hello ${name}`;');
    const file = path.join(scripts, 'report.ts');
    fs.writeFileSync(file, [
      "import { greet } from 'greet';",
      "import * as path from 'node:path';",
      'export default ({ db }: any) => ({ greeting: greet(db.query.getAttr("Note-a", "title")), here: path.basename(import.meta.dirname) });',
    ].join('\n'));
    fs.chmodSync(scripts, 0o555);

    try {
      const cli = path.resolve(import.meta.dirname, '..', '..', 'bin', 'abuddy.mjs');
      const run = spawnSync(process.execPath, [cli, 'db', 'script', file, '--data-dir', dir, '-o', 'json'], { encoding: 'utf-8' });
      expect(run.status, run.stderr).toBe(0);
      // The package next to the script loaded, and import.meta still points at the script's own directory
      expect(JSON.parse(run.stdout)).toEqual({ greeting: 'hello Alpha', here: 'read-only-scripts' });
    } finally {
      fs.chmodSync(scripts, 0o755);
    }
  });

  const cliBin = () => path.resolve(import.meta.dirname, '..', '..', 'bin', 'abuddy.mjs');

  /** The CLI as a user runs it: its own process, so a script's pending work and the exit code are the real ones */
  function runCli(args: string[], input = ''): { status: number | null; stdout: string; stderr: string } {
    const run = spawnSync(process.execPath, [cliBin(), 'db', 'script', ...args], { encoding: 'utf-8', input });
    return { status: run.status, stdout: run.stdout, stderr: run.stderr };
  }

  /**
   * The same, with nothing read from it until it exits (or a moment passes, since a run that waits for its output to
   * be taken can't exit first): a slow reader, where output the CLI hasn't flushed is lost.
   */
  function runCliSlowReader(args: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [cliBin(), 'db', 'script', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      let reading = false;
      const read = () => {
        if (reading) return;
        reading = true;
        child.stdout.setEncoding('utf-8');
        child.stderr.setEncoding('utf-8');
        child.stdout.on('data', (chunk: string) => { stdout += chunk; });
        child.stderr.on('data', (chunk: string) => { stderr += chunk; });
      };
      const waited = setTimeout(read, 1500);
      child.on('exit', read);
      child.on('close', (status) => { clearTimeout(waited); resolve({ status, stdout, stderr }); });
    });
  }

  it('waits for an async script, printing everything it logged and saving what it wrote', async () => {
    const dir = await appDataDir();
    const file = writeScript(dir, 'slow.mjs', [
      'export default async ({ db, log }) => {',
      "  log('first');",
      '  await new Promise((resolve) => setTimeout(resolve, 250));',
      "  db.query.tx('Note-a').put('title', 'Written late');",
      "  log('second');",
      '  await new Promise((resolve) => setTimeout(resolve, 250));',
      "  return 'finished';",
      '};',
    ].join('\n'));

    const run = runCli([file, '--data-dir', dir]);
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout.trim().split('\n')).toEqual(['first', 'second', 'finished']);
    expect((await ok(['query', "return getAttr('Note-a', 'title')", '--data-dir', dir])).out).toBe('Written late');
  });

  it('waits for a script that asks the user something', async () => {
    const dir = await appDataDir();
    const file = writeScript(dir, 'ask.mjs', [
      "import * as readline from 'node:readline/promises';",
      'export default async ({ db, log }) => {',
      '  const lines = readline.createInterface({ input: process.stdin, output: process.stdout });',
      "  const answer = await lines.question('Rename Note-a? (y/N) ');",
      '  lines.close();',
      "  if (answer.trim().toLowerCase() !== 'y') return 'cancelled';",
      "  db.query.tx('Note-a').put('title', 'Renamed');",
      "  log('renamed');",
      "  return 'done';",
      '};',
    ].join('\n'));

    const run = runCli([file, '--data-dir', dir], 'y\n');
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('renamed');
    expect(run.stdout.trim().endsWith('done')).toBe(true);
    expect((await ok(['query', "return getAttr('Note-a', 'title')", '--data-dir', dir])).out).toBe('Renamed');
  });

  it('fails, naming the script, when it throws or rejects, keeping what it printed first', async () => {
    const dir = await appDataDir();
    const rejects = writeScript(dir, 'rejects.mjs', [
      'export default async ({ log }) => {',
      '  for (let i = 0; i < 20000; i++) log(`line ${i} ${"x".repeat(100)}`);',
      '  await new Promise((resolve) => setTimeout(resolve, 100));',
      "  throw new Error('boom from the script');",
      '};',
    ].join('\n'));

    const rejected = await runCliSlowReader([rejects, '--data-dir', dir]);
    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain(`${rejects} failed: boom from the script`);
    // Everything it printed before it failed is there, rather than dropped by the exit
    expect(rejected.stdout.trim().split('\n').at(-1)).toBe(`line 19999 ${'x'.repeat(100)}`);

    const throws = writeScript(dir, 'throws.mjs', "export default () => { throw new Error('thrown at once'); };");
    const thrown = await run(['script', throws, '--data-dir', dir]);
    expect(thrown.error?.message).toBe(`${throws} failed: thrown at once`);
    // The database was closed whichever way it failed, so nothing holds the write lock
    expect(findDatabaseWriter(dir)).toBeNull();
  });

  it('refuses a file that is missing, or exports no function, changing nothing', async () => {
    const dir = await appDataDir();
    expect((await run(['script', path.join(dir, 'nope.ts'), '--data-dir', dir])).error?.message).toBe(`No script at ${path.join(dir, 'nope.ts')}`);
    expect((await run(['script', '--data-dir', dir])).error?.message).toMatch(/^Name the script to run\n\nUsage: abuddy db script/);

    const noExport = writeScript(dir, 'no-export.ts', 'export const notDefault = () => 1;');
    expect((await run(['script', noExport, '--data-dir', dir])).error?.message)
      .toBe(`${noExport} exports no function to run: export default ({ db, EARS, args, log }) => { ... }`);
    expect(findDatabaseWriter(dir)).toBeNull();
  });

  it('writes by default, and only reads with --read-only, which works while an app runs', async () => {
    const dir = await appDataDir();
    const write = writeScript(dir, 'write.ts', "export default ({ db }: any) => db.query.tx('Note-a').put('title', 'Changed');");
    publishApi(dir);
    expect((await run(['script', write, '--data-dir', dir])).error?.message).toMatch(/quit it first/);

    const read = writeScript(dir, 'read.ts', "export default ({ db }: any) => db.query.getAttr('Note-a', 'title');");
    const { out, err } = await ok(['script', read, '--data-dir', dir, '--read-only']);
    expect(out).toBe('Alpha');
    expect(err).toMatch(/Warning: AgentBuddy is running on it/);
    // A read-only run can't write, and takes no lock
    const refused = await run(['script', write, '--data-dir', dir, '--read-only']);
    expect(refused.error?.message).toMatch(/open read-only/);
  });
});

describe('abuddy db inspect', () => {
  it("shows an entity's roles and relations, in the directions asked", async () => {
    const dir = await appDataDir();
    const both = await ok(['inspect', 'Note-b', '--data-dir', dir, '--depth', '2']);
    expect(both.out.split('\n')).toEqual([
      '[Note] Note-b "Beta, "quoted""',
      '  <- parent_of (1)',
      '    [Note] Note-a "Alpha"',
      '      roles: pinned',
      '      -> parent_of (1)',
      '          [Note] Note-b',
    ]);
    const deeper = await ok(['inspect', 'Note-b', '--data-dir', dir, '--depth', '3']);
    expect(deeper.out.split('\n').at(-1)).toBe('        [Note] Note-b (shown above)');
    const outgoing = await ok(['inspect', 'Note-b', '--data-dir', dir, '--outgoing']);
    expect(outgoing.out).toBe('[Note] Note-b "Beta, "quoted""');
    expect((await ok(['inspect', 'Note-x', '--data-dir', dir])).out).toBe('Not found: Note-x');
  });

  it('shows only incoming relations with --incoming, and only the first five of a crowded type', async () => {
    const dir = await appDataDir();
    const incoming = await ok(['inspect', 'Note-a', '--data-dir', dir, '--incoming']);
    // Note-a has one outgoing relation (parent_of Note-b) and no incoming one, so only its own line is left
    expect(incoming.out).toBe('[Note] Note-a "Alpha"\n  roles: pinned');

    await write(dir, () => {
      for (const n of [1, 2, 3, 4, 5, 6]) untypedTx(id(`Note-many-${n}`), true).put('entityType', 'Note').put('title', `Many ${n}`);
    });
    const many = await ok(['inspect', '--type', 'Note', '--data-dir', dir]);
    const lines = many.out.split('\n');
    expect(lines[0]).toBe('8 Note entities, the first 5:');
    expect(lines.filter((line) => line.startsWith('[Note] '))).toHaveLength(5);
  });

  it('counts relations per entity type, or shows the first entities of one', async () => {
    const dir = await appDataDir();
    const stats = await ok(['inspect', '--data-dir', dir]);
    expect(stats.out.split('\n')).toContainEqual(expect.stringMatching(/^Note\s+2\s+1\s+0\.5$/));
    const byType = await ok(['inspect', '--type', 'Settings', '--data-dir', dir]);
    expect(byType.out.split('\n').slice(0, 2)).toEqual(['1 Settings entities', '[Settings] Settings-app "App"']);
    expect((await run(['inspect', 'Note-a', '--type', 'Note', '--data-dir', dir])).error?.message).toMatch(/not both/);
    // A type no installed pack declares is a typo, not an empty result, as in export
    expect((await run(['inspect', '--type', 'Nope', '--data-dir', dir])).error?.message).toBe('Not an entity type of the installed packs: Nope');
    expect((await run(['inspect', '--depth', '0', '--data-dir', dir])).error?.message).toMatch(/--depth/);
  });
});

describe('abuddy db export', () => {
  it('writes a file per entity type with entities, and a summary', async () => {
    const dir = await appDataDir();
    const out = path.join(dir, 'export');
    await ok(['export', '--out', out, '--data-dir', dir]);
    const notes = JSON.parse(fs.readFileSync(path.join(out, 'Note.json'), 'utf-8'));
    expect(notes.map((n: { id: string }) => n.id).sort()).toEqual(['Note-a', 'Note-b']);
    expect(notes.find((n: { id: string }) => n.id === 'Note-a')).toMatchObject({ title: 'Alpha', role: 'pinned' });
    expect(fs.existsSync(path.join(out, 'Relation.json'))).toBe(true);
    expect(fs.existsSync(path.join(out, 'Flow.json'))).toBe(false);
    const summary = JSON.parse(fs.readFileSync(path.join(out, 'export.json'), 'utf-8'));
    expect(summary).toMatchObject({ userDataDir: dir, format: 'json', counts: { Note: 2, Settings: 1, AppState: 1, Relation: 1 } });
  });

  it('exports the types asked, as CSV, and refuses a type no pack declares', async () => {
    const dir = await appDataDir();
    const out = path.join(dir, 'export');
    await ok(['export', '--out', out, '--type', 'Settings', '-t', 'Flow', '--format', 'csv', '--data-dir', dir]);
    expect(fs.readdirSync(out).sort()).toEqual(['Flow.csv', 'Settings.csv', 'export.json']);
    const [header, row] = fs.readFileSync(path.join(out, 'Settings.csv'), 'utf-8').split('\n');
    expect(header.split(',')).toEqual(expect.arrayContaining(['id', 'entityType', 'label', 'data']));
    expect(row).toContain('"{""general"":{""theme"":""dark""}}"');
    expect((await run(['export', '--out', out, '--type', 'Nope', '--data-dir', dir])).error?.message).toBe('Not an entity type of the installed packs: Nope');
    expect((await run(['export', '--data-dir', dir])).error?.message).toMatch(/^--out is required/);
  });
});

describe('abuddy db clear-settings', () => {
  it('lists the Settings rows, and destroys them only with --force', async () => {
    const dir = await appDataDir();
    const dry = await ok(['clear-settings', '--data-dir', dir]);
    expect(dry.out).toContain('Would destroy 1 Settings row(s):\n  Settings-app  label: App  stored keys: general');
    expect(dry.out).toContain('Dry run: nothing was changed');
    expect((await ok(['query', 'return getEntitiesOfType("Settings")', '--data-dir', dir, '-o', 'json'])).out).toContain('Settings-app');

    const forced = await ok(['clear-settings', '--force', '--data-dir', dir]);
    expect(forced.out).toContain('Destroyed 1 Settings row(s)');
    expect(JSON.parse((await ok(['query', 'return getEntitiesOfType("Settings")', '--data-dir', dir, '-o', 'json'])).out)).toEqual([]);
    expect((await ok(['clear-settings', '--force', '--data-dir', dir])).out).toBe('No Settings rows: nothing to destroy.');
  });

  // Only the Settings rows: the command is for settings a user can't get past, not for their data
  it('leaves every other entity, its roles and its relations where they were', async () => {
    const dir = await appDataDir();
    const rows = () => ok(['query', 'return getAllEntities().sort()', '--data-dir', dir, '-o', 'json']);
    const before = JSON.parse((await rows()).out) as string[];

    await ok(['clear-settings', '--force', '--data-dir', dir]);

    expect(JSON.parse((await rows()).out)).toEqual(before.filter((entity) => entity !== 'Settings-app'));
    expect(JSON.parse((await ok(['query', 'return getRoles("Note-a")', '--data-dir', dir, '-o', 'json'])).out)).toEqual(['pinned']);
    expect(JSON.parse((await ok(['query', 'return findRelations({ sourceEntity: "Note-a" }).map((r) => r.targetEntity)', '--data-dir', dir, '-o', 'json'])).out))
      .toEqual(['Note-b']);
    expect((await ok(['query', 'return getAttr("Note-a", "title")', '--data-dir', dir])).out).toBe('Alpha');
  });

  it('refuses while an app runs on the data dir', async () => {
    const dir = await appDataDir();
    holdLock(dir);
    expect((await run(['clear-settings', '--force', '--data-dir', dir])).error?.message).toMatch(/quit it first/);
  });
});

describe('a dry run of a command that changes data', () => {
  it('reads, so it works while an app runs on the data dir and against files it may not write', async () => {
    const running = await appDataDir();
    publishApi(running);
    const listed = await ok(['reset', '--data-dir', running]);
    expect(listed.out).toContain('Would delete the database');
    expect(listed.err).toMatch(/Warning: AgentBuddy is running on it/);
    // Only the change itself is refused
    expect((await run(['reset', '--force', '--data-dir', running])).error?.message).toMatch(/quit it first/);

    const copy = await appDataDir();
    const { lmdb, volatileLmdb } = _appDataPaths(copy, { packaged: false });
    const files = [lmdb, volatileLmdb].flatMap((db) => fs.readdirSync(db).map((file) => path.join(db, file)));
    for (const file of files) fs.chmodSync(file, 0o444);
    try {
      expect((await ok(['clear-settings', '--data-dir', copy])).out).toContain('Would destroy 1 Settings row(s)');
      const backup = await backupOf(copy);
      expect((await ok(['import', backup, '--data-dir', copy])).out).toContain('Would replace the current database');
    } finally {
      for (const file of files) fs.chmodSync(file, 0o644);
    }
  });

  it('takes no lock, so two dry runs can run at once', async () => {
    const dir = await appDataDir();
    const held = holdDatabaseWriteLock(dir, 'abuddy db import');
    try {
      expect((await ok(['reset', '--data-dir', dir])).out).toContain('Would delete the database');
    } finally {
      held.release();
    }
  });
});

describe('abuddy db reset', () => {
  async function withKey(dir: string): Promise<string> {
    const file = _appDataPaths(dir, { packaged: false }).secretsFile;
    const vault = memoryKeyVault('unprotected');
    createSecretsStore({ filePath: file, osVault: () => vault, fileVault: () => vault, useFileVault: true }).add('anthropic', 'Work', 'sk-ant-api03-test');
    return file;
  }

  it('lists what it would delete, and deletes the data and stored keys only with --force', async () => {
    const dir = await appDataDir();
    const secretsFile = await withKey(dir);
    const dry = await ok(['reset', '--data-dir', dir]);
    expect(dry.out).toContain('Would delete the database');
    expect(dry.out).toContain('  Note: 2');
    expect(dry.out).toContain('Would delete 1 stored API key(s), which no backup holds:\n  Anthropic — Work (selected)');
    expect(dry.out).toContain('Dry run: nothing was changed');
    expect(JSON.parse(fs.readFileSync(secretsFile, 'utf-8')).secrets).toHaveLength(1);

    const forced = await ok(['reset', '--force', '--data-dir', dir]);
    expect(forced.out).toContain('Reset. AgentBuddy creates its default data on its next start.');
    expect(JSON.parse(fs.readFileSync(secretsFile, 'utf-8')).secrets).toEqual([]);
    const after = await ok(['query', 'return getAllEntities()', '--data-dir', dir, '-o', 'json']);
    expect(JSON.parse(after.out)).toEqual([]);
    expect((await ok(['reset', '--data-dir', dir])).out).toContain('Would delete 0 stored API key(s)');
  });

  // The keys are the half no backup holds, so wiping the data doesn't have to take them
  it('keeps the stored keys with --keep-keys, and says so', async () => {
    const dir = await appDataDir();
    const secretsFile = await withKey(dir);

    const dry = await ok(['reset', '--keep-keys', '--data-dir', dir]);
    expect(dry.out).toContain('Keeping 1 stored API key(s) (--keep-keys)');
    expect(dry.out).not.toContain('Would delete 1 stored API key');

    await ok(['reset', '--keep-keys', '--force', '--data-dir', dir]);
    expect(JSON.parse(fs.readFileSync(secretsFile, 'utf-8')).secrets).toHaveLength(1);
    expect(JSON.parse((await ok(['query', 'return getAllEntities()', '--data-dir', dir, '-o', 'json'])).out)).toEqual([]);
  });

  it('refuses while an app runs on the data dir', async () => {
    const dir = await appDataDir();
    publishApi(dir);
    expect((await run(['reset', '--force', '--data-dir', dir])).error?.message).toMatch(/quit it first/);
    expect((await ok(['query', 'return getEntitiesOfType("Note").length', '--data-dir', dir])).out).toBe('2');
  });
});

describe('abuddy db import', () => {
  const backupWith = async (title: string, options: { databases?: Array<'lmdb' | 'volatileLmdb'> } = {}) => {
    const source = await appDataDir();
    await write(source, () => { untypedTx(id('Note-a')).put('title', title); untypedTx(id('Note-b')).destroy(); });
    return backupOf(source, { withMedia: true, ...options });
  };

  it('lists the backup and what it replaces, and replaces the database and media only with --force', async () => {
    const dir = await appDataDir();
    const backup = await backupWith('From the backup');
    const dry = await ok(['import', backup, '--data-dir', dir]);
    expect(dry.out).toContain(`Backup: ${backup}`);
    expect(dry.out).toContain('  databases: lmdb, with media');
    expect(dry.out).toMatch(/Would replace the current database, which holds:\n(.*\n)*  Note: 2/);
    expect(dry.out).toContain('Dry run: nothing was changed');
    expect((await ok(['query', "return getAttr('Note-a', 'title')", '--data-dir', dir])).out).toBe('Alpha');

    await ok(['import', backup, '--force', '--data-dir', dir]);
    expect((await ok(['query', "return [getAttr('Note-a', 'title'), getEntitiesOfType('Note').length]", '--data-dir', dir, '-o', 'json'])).out)
      .toBe(JSON.stringify(['From the backup', 1], null, 2));
    expect(fs.readFileSync(path.join(_appDataPaths(dir, { packaged: false }).media, 'image.png'), 'utf-8')).toBe('png');
  });

  it('says what made the backup, and names it when the files are in a format it cannot read', async () => {
    const dir = await appDataDir();
    const backup = await backupWith('From the backup');
    const metadata = JSON.parse(fs.readFileSync(path.join(backup, 'metadata.json'), 'utf-8'));
    expect(metadata).toMatchObject({ appVersion: '0.3.14', storageFormat: expect.any(Number) });
    expect(Object.keys(metadata).sort()).toEqual(['appVersion', 'databases', 'includesMedia', 'storageFormat', 'timestamp']);

    const listed = await ok(['import', backup, '--data-dir', dir]);
    expect(listed.out).toMatch(/made .* by AgentBuddy 0\.3\.14/);

    // The databases themselves are what a newer AgentBuddy would have written
    writeStorageFormat(path.join(backup, 'lmdb'), 99);
    const refused = await run(['import', backup, '--force', '--data-dir', dir]);
    expect(refused.error?.message).toMatch(/is in storage format 99, but this version reads format 1/);
    expect(refused.error?.message).toContain('(backup made by AgentBuddy 0.3.14)');
    expect((await ok(['query', "return getAttr('Note-a', 'title')", '--data-dir', dir])).out).toBe('Alpha');
  });

  // Every database the import would put in place, not only the main one: finding it afterwards would leave the
  // rollback to put the user's data back
  it('refuses a backup whose run history is in a storage format this version cannot read, before replacing anything', async () => {
    const dir = await appDataDir();
    const backup = await backupWith('From the backup', { databases: ['lmdb', 'volatileLmdb'] });
    expect(fs.existsSync(path.join(backup, 'volatileLmdb'))).toBe(true);
    writeStorageFormat(path.join(backup, 'volatileLmdb'), 99);

    const refused = await run(['import', backup, '--force', '--data-dir', dir]);

    expect(refused.error?.message).toMatch(/is in storage format 99, but this version reads format 1/);
    // Nothing was put in place: the import says so for each database it replaces, and the rollback would have had to
    // put the user's data back
    expect(refused.err).not.toContain('Imported ');
    expect((await ok(['query', "return getAttr('Note-a', 'title')", '--data-dir', dir])).out).toBe('Alpha');
  });

  it("restores a backup whose metadata claims a format its databases aren't in", async () => {
    const dir = await appDataDir();
    const backup = await backupWith('From the backup');
    const metadataFile = path.join(backup, 'metadata.json');
    const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf-8'));
    // The files are what says whether a backup restores: a metadata.json claiming otherwise doesn't cost the
    // user a backup that opens and reads
    fs.writeFileSync(metadataFile, JSON.stringify({ ...metadata, storageFormat: 99 }));

    await ok(['import', backup, '--force', '--data-dir', dir]);
    expect((await ok(['query', "return getAttr('Note-a', 'title')", '--data-dir', dir])).out).toBe('From the backup');
  });

  it('restores a backup made before what wrote it was recorded', async () => {
    const dir = await appDataDir();
    const backup = await backupWith('From the old backup');
    const metadataFile = path.join(backup, 'metadata.json');
    const { appVersion, storageFormat, ...older } = JSON.parse(fs.readFileSync(metadataFile, 'utf-8'));
    fs.writeFileSync(metadataFile, JSON.stringify(older));

    const listed = await ok(['import', backup, '--data-dir', dir]);
    expect(listed.out).not.toContain('by AgentBuddy');
    // The files' own stamp still answers for it
    await ok(['import', backup, '--force', '--data-dir', dir]);
    expect((await ok(['query', "return getAttr('Note-a', 'title')", '--data-dir', dir])).out).toBe('From the old backup');
  });

  it("keeps the backup's own progress lines off stdout, so only the command's output is there", async () => {
    const dir = await appDataDir();
    const backup = await backupWith('From the backup');
    const { out, err } = await ok(['import', backup, '--force', '--data-dir', dir]);
    expect(err).toContain('Imported lmdb');
    expect(err).toContain('Import completed');
    expect(out).not.toMatch(/Imported lmdb|Restored media|Import completed/);
    expect(out.trim().split('\n').at(-1)).toBe('Imported.');
  });

  it('refuses a backup that is not one or lacks a database, changing nothing', async () => {
    const dir = await appDataDir();
    const notBackup = tempDir('not-backup-');
    expect((await run(['import', notBackup, '--force', '--data-dir', dir])).error?.message).toMatch(/isn't a backup: it has no metadata\.json/);


    const missing = await backupWith('x');
    fs.rmSync(path.join(missing, 'lmdb'), { recursive: true });
    expect((await run(['import', missing, '--force', '--data-dir', dir])).error?.message).toMatch(/lmdb folder is missing/);

    expect((await ok(['query', "return getAttr('Note-a', 'title')", '--data-dir', dir])).out).toBe('Alpha');
  });

  it('says when the backup lists a store it holds nothing for, rather than dropping it quietly', async () => {
    const dir = await appDataDir();
    const backup = await backupWith('From the backup');
    const metadata = JSON.parse(fs.readFileSync(path.join(backup, 'metadata.json'), 'utf-8'));
    // Listed, but the folder isn't there: empty when the backup was made, or lost since
    fs.writeFileSync(path.join(backup, 'metadata.json'), JSON.stringify({ ...metadata, databases: ['lmdb', 'volatileLmdb'] }));

    const listed = await ok(['import', backup, '--data-dir', dir]);
    expect(listed.out).toContain('lists volatileLmdb but holds nothing for it, so it comes back empty');

    await ok(['import', backup, '--force', '--data-dir', dir]);
    expect((await ok(['query', "return getAttr('Note-a', 'title')", '--data-dir', dir])).out).toBe('From the backup');
  });

  it('says when the backup holds rows of a type no installed pack declares, and keeps them', async () => {
    const dir = await appDataDir();
    const source = await appDataDir();
    // A pack was installed when the backup was made: its snapshot declares Bookmark, which the target dir's doesn't
    const snapshot = path.join(source, 'host-packs', 'default-setup', 'types', 'snapshot.json');
    const manifest = JSON.parse(fs.readFileSync(snapshot, 'utf-8'));
    manifest.entities = { ...manifest.entities, Bookmark: 'Bookmark' };
    fs.writeFileSync(snapshot, JSON.stringify(manifest));
    await write(source, () => {
      untypedTx(id('Bookmark-1'), true).put('entityType', 'Bookmark').put('url', 'https://example.com');
      untypedTx(id('Bookmark-2'), true).put('entityType', 'Bookmark').put('url', 'https://example.org');
    });
    const backup = await backupOf(source);

    const dry = await ok(['import', backup, '--data-dir', dir]);
    expect(dry.out).toContain('holds 2 Bookmark that no installed pack declares');

    await ok(['import', backup, '--force', '--data-dir', dir]);
    // Kept, not dropped: installing that pack again brings them back into use
    const kept = await ok(['query', "return getAttr('Bookmark-1', 'url')", '--data-dir', dir]);
    expect(kept.out).toBe('https://example.com');
  });

  it("refuses a backup from a newer AgentBuddy, saying how to import it without what this one can't hold", async () => {
    const dir = await appDataDir();
    const backup = await backupWith('From the backup');
    const metadata = JSON.parse(fs.readFileSync(path.join(backup, 'metadata.json'), 'utf-8'));
    fs.writeFileSync(path.join(backup, 'metadata.json'), JSON.stringify({ ...metadata, databases: [...metadata.databases, 'searchIndex'] }));

    const refused = await run(['import', backup, '--force', '--data-dir', dir]);
    expect(refused.error?.message).toBe(
      "The backup also holds searchIndex, which this AgentBuddy doesn't have: it was made by a newer one, and importing it " +
      'would replace your data with an incomplete copy. Run again with --skip-unknown to import it without those.',
    );
    expect((await ok(['query', "return getAttr('Note-a', 'title')", '--data-dir', dir])).out).toBe('Alpha');

    // The dry run says what it would leave out
    expect((await ok(['import', backup, '--skip-unknown', '--data-dir', dir])).out)
      .toContain("leaving out searchIndex, which this AgentBuddy doesn't have");

    await ok(['import', backup, '--force', '--skip-unknown', '--data-dir', dir]);
    expect((await ok(['query', "return getAttr('Note-a', 'title')", '--data-dir', dir])).out).toBe('From the backup');
  });

  it('refuses while an app runs on the data dir', async () => {
    const dir = await appDataDir();
    const backup = await backupWith('x');
    holdLock(dir);
    expect((await run(['import', backup, '--force', '--data-dir', dir])).error?.message).toMatch(/quit it first/);
  });
});

describe('abuddy db', () => {
  it('prints its usage, and each command its own', async () => {
    expect((await ok([])).out).toMatch(/^Usage: abuddy db <command>/);
    expect((await ok(['reset', '--help'])).out).toMatch(/^Usage: abuddy db reset \[--force\]/);
    expect((await run(['nope'])).error?.message).toMatch(/^Unknown db command: nope/);
  });
});
