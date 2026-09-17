// abuddy db, offline, against temp data dirs: each command's output and changes, the refusals while an app runs on the
// data dir, and the dry runs of the commands that replace or delete data
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { installEngine, installedEngine, tx, type EARS } from '@abuddy/ears';
import { findDatabaseWriter, holdDatabaseWriteLock, openDatabaseStore, readInstalledSchema } from '@abuddy/host/database';
import { exportDatabase } from '@abuddy/host/backup';
import { createSecretsStore, memoryKeyVault } from '@abuddy/host/secrets';
import { appDataPaths } from '@abuddy/sdk/utils';
import { db } from '../../src/commands/db';
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
    registryFile: path.join(userDataDir, 'pack-registry.json'),
  };
}

/** Writes to the data dir's database as the app does (default-setup published, source layout) */
async function write(userDataDir: string, change: () => void): Promise<void> {
  const paths = appDataPaths(userDataDir, { packaged: false });
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
    tx(id('AppState-app'), true).put('entityType', 'AppState').put('hasOnboarded', true);
    tx(id('Settings-app'), true).put('entityType', 'Settings').put('label', 'App').put('data', { general: { theme: 'dark' } });
    tx(id('Note-a'), true).put('entityType', 'Note').put('title', 'Alpha').grant('pinned').link('parent_of', id('Note-b'));
    tx(id('Note-b'), true).put('entityType', 'Note').put('title', 'Beta, "quoted"');
    // The run history, which the app keeps in its own partition (TNode is excluded from the main one)
    tx(id('TNode-1'), true).put('entityType', 'TNode').put('status', 'completed');
  });
  return dir;
}

/** A backup of a data dir, as the app exports it */
async function backupOf(userDataDir: string, { withMedia = false } = {}): Promise<string> {
  const paths = appDataPaths(userDataDir, { packaged: false });
  if (withMedia) {
    fs.mkdirSync(paths.media, { recursive: true });
    fs.writeFileSync(path.join(paths.media, 'image.png'), 'png');
  }
  return exportDatabase({ paths: { primary: paths.lmdb, volatileBackup: paths.volatileLmdb } }, tempDir('backup-'), { name: 'backup', mediaPath: paths.media });
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

const holdLock = (dir: string) => fs.symlinkSync(`${os.hostname()}-${process.pid}`, path.join(dir, 'SingletonLock'));

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
    const { lmdb, volatileLmdb } = appDataPaths(dir, { packaged: false });
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
    expect(err).toMatch(/Warning: AgentBuddy is running on it \(process \d+ holds/);
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

  it('takes --production as naming the production data dir', async () => {
    const dir = await appDataDir();
    process.env.ABUDDY_USER_DATA_DIR = dir;
    try {
      const { out, err } = await ok(['exec', "tx('Note-a').put('title', 'Named')", '--production']);
      expect(err).toContain(`Database: ${dir} (offline)`);
      expect(out).toBe('undefined');
      expect((await ok(['query', "return getAttr('Note-a', 'title')", '--production'])).out).toBe('Named');
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
      expect(error?.message).toBe(`Another tool is changing the database in ${dir}: abuddy db import (pid ${process.pid})`);
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
    expect(byLock.error?.message).toMatch(/^AgentBuddy is running on .* \(process \d+ holds .*\): quit it first/);

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

  it("reports the code's own error first when closing fails too", async () => {
    const dir = await appDataDir();
    // The code writes a value LMDB can't store, then throws
    const { error } = await run(['exec', "tx('Note-a').put('count', 1n); throw new Error('boom')", '--data-dir', dir]);
    expect(error?.message).toMatch(/^Transaction failed: boom\n  The database also failed to close: 1 write\(s\) didn't reach the database/);
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
    const run = spawnSync(process.execPath, [cli, 'db', 'script', file, '--data-dir', dir, '-o', 'json', '--', 'Note-a'], { encoding: 'utf-8' });
    expect(run.stderr).toContain(`Database: ${dir} (offline)`);
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual({ title: 'Alpha', notes: 2 });
    // Nothing compiled is left beside the script
    expect(fs.readdirSync(dir).filter((name) => name.endsWith('.mjs'))).toEqual([]);
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

  it('counts relations per entity type, or shows the first entities of one', async () => {
    const dir = await appDataDir();
    const stats = await ok(['inspect', '--data-dir', dir]);
    expect(stats.out.split('\n')).toContainEqual(expect.stringMatching(/^Note\s+2\s+1\s+0\.5$/));
    const byType = await ok(['inspect', '--type', 'Settings', '--data-dir', dir]);
    expect(byType.out.split('\n').slice(0, 2)).toEqual(['1 Settings entities', '[Settings] Settings-app "App"']);
    expect((await run(['inspect', 'Note-a', '--type', 'Note', '--data-dir', dir])).error?.message).toMatch(/not both/);
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
    const { lmdb, volatileLmdb } = appDataPaths(copy, { packaged: false });
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
    const file = appDataPaths(dir, { packaged: false }).secretsFile;
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
    expect(dry.out).toContain('Would delete 1 stored API key(s)');
    expect(dry.out).toContain('Dry run: nothing was changed');
    expect(JSON.parse(fs.readFileSync(secretsFile, 'utf-8')).secrets).toHaveLength(1);

    const forced = await ok(['reset', '--force', '--data-dir', dir]);
    expect(forced.out).toContain('Reset. AgentBuddy creates its default data on its next start.');
    expect(JSON.parse(fs.readFileSync(secretsFile, 'utf-8')).secrets).toEqual([]);
    const after = await ok(['query', 'return getAllEntities()', '--data-dir', dir, '-o', 'json']);
    expect(JSON.parse(after.out)).toEqual([]);
    expect((await ok(['reset', '--data-dir', dir])).out).toContain('Would delete 0 stored API key(s)');
  });

  it('refuses while an app runs on the data dir', async () => {
    const dir = await appDataDir();
    publishApi(dir);
    expect((await run(['reset', '--force', '--data-dir', dir])).error?.message).toMatch(/quit it first/);
    expect((await ok(['query', 'return getEntitiesOfType("Note").length', '--data-dir', dir])).out).toBe('2');
  });
});

describe('abuddy db import', () => {
  const backupWith = async (title: string) => {
    const source = await appDataDir();
    await write(source, () => { tx(id('Note-a')).put('title', title); tx(id('Note-b')).destroy(); });
    return backupOf(source, { withMedia: true });
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
    expect(fs.readFileSync(path.join(appDataPaths(dir, { packaged: false }).media, 'image.png'), 'utf-8')).toBe('png');
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
