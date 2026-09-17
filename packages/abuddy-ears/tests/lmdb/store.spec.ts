// openLmdbStore: the engine's writes reach LMDB through store.sink, and a store opened again on the same
// paths hydrates them back
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEarsEngine, installEngine, makePolicy, tx, getEntitiesOfType, type EARS, type EarsEngine } from '../../src/index.ts';
import { open as openEnv } from 'lmdb';
import { LMDB_FORMAT_VERSION, openLmdbStore, type LmdbStore, type LmdbStoreOptions } from '../../src/lmdb/index.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ears-lmdb-store-'));
const policy = makePolicy({ excludedEntityTypes: new Set(['Trace']) });
let paths: { primary: string; volatileBackup: string };
const open: LmdbStore[] = [];
let engine: EarsEngine;

/** A store and a new engine persisting to it, installed, as an app's composition opens them */
function openStore(options: Pick<LmdbStoreOptions, 'readOnly' | 'log'> = {}): LmdbStore {
  const store = openLmdbStore({ paths, policy, engine: () => engine.admin, ...options });
  engine = createEarsEngine({ persistence: store.sink, isEntityType: () => false });
  installEngine(engine.query);
  open.push(store);
  return store;
}
const getAttr = (entity: EARS.EntityId, kind: string) => engine.query.getAttr(entity, kind);

/** The adapter flushes in a microtask */
const flushed = () => new Promise<void>((resolve) => setImmediate(resolve));
const id = (name: string) => name as EARS.EntityId;

beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(root, 'case-'));
  paths = { primary: path.join(dir, 'ears-db'), volatileBackup: path.join(dir, 'ears-trace') };
});
afterEach(() => {
  for (const store of open.splice(0)) store.close();
  installEngine(undefined);
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('openLmdbStore', () => {
  it('persists writes across a close and a new store on the same paths', async () => {
    const first = openStore();
    tx(id('Note-1'), true).put('title', 'kept');
    tx(id('Trace-1'), true).put('step', 'volatile');
    tx(id('Note-1')).link('mentions', id('Note-2'));
    await flushed();
    first.close();

    // A new engine: nothing in memory
    const second = openStore();
    expect(getEntitiesOfType('Relation')).toEqual([]);
    await second.hydrate();
    expect(getAttr(id('Note-1'), 'title')).toBe('kept');
    expect(getEntitiesOfType('Relation')).toHaveLength(1);
    // Only the primary partition is hydrated; the volatile one is read directly
    expect(getAttr(id('Trace-1'), 'step')).toBeNull();
    expect(second.query('volatileBackup').getFirstAttr('step', 'Trace-1')).toBe('volatile');

    await second.hydrate({ includeVolatile: true });
    expect(getAttr(id('Trace-1'), 'step')).toBe('volatile');
  });

  it('keeps one sink across a reopen, and drops writes while closed', async () => {
    const store = openStore();
    const { sink } = store;
    store.close();
    expect(store.isOpen()).toBe(false);
    expect(() => store.envs).toThrow('The LMDB store is closed');
    tx(id('Note-dropped'), true).put('title', 'lost');

    store.reopen();
    expect(store.isOpen()).toBe(true);
    expect(store.sink).toBe(sink);
    tx(id('Note-after'), true).put('title', 'saved');
    await flushed();
    expect(store.query('primary').getFirstAttr('title', 'Note-after')).toBe('saved');
    expect(store.query('primary').getEntityMeta('Note-dropped')).toBeNull();
  });

  it('reset deletes the files and opens the store empty', async () => {
    const store = openStore();
    tx(id('Note-1'), true).put('title', 'gone');
    await flushed();
    await store.reset();
    expect(store.isOpen()).toBe(true);
    expect(store.query('primary').getEntityMeta('Note-1')).toBeNull();
    // The engine's memory is the caller's
    expect(getAttr(id('Note-1'), 'title')).toBe('gone');
  });

  it('writes what the engine wrote while a reset had the store closed to the new files', async () => {
    const store = openStore();
    tx(id('Note-1'), true).put('title', 'gone');
    await flushed();

    const resetting = store.reset();
    // A system still running writes while the files are being replaced
    expect(store.isOpen()).toBe(false);
    tx(id('Note-2'), true).put('title', 'written during the reset');
    await resetting;
    await flushed();

    expect(store.query('primary').getEntityMeta('Note-1')).toBeNull();
    expect(store.query('primary').getFirstAttr('title', 'Note-2')).toBe('written during the reset');
    // A store closed any other way still drops writes
    store.close();
    tx(id('Note-3'), true).put('title', 'dropped');
    store.reopen();
    await flushed();
    expect(store.query('primary').getEntityMeta('Note-3')).toBeNull();
  });

  it("keeps a run's history link when the entity it ran is destroyed, and removes it with the run or an unlink", async () => {
    const store = openStore();
    tx(id('Note-1'), true).put('title', 'ran');
    tx(id('Note-2'), true).put('title', 'ran too');
    tx(id('Trace-1'), true).put('step', 'run');
    tx(id('Trace-2'), true).put('step', 'run');
    tx(id('Trace-3'), true).put('step', 'run');
    const kept = engine.admin.addRelation(id('Trace-1'), 'instance_of', id('Note-1'));
    const withRun = engine.admin.addRelation(id('Trace-2'), 'instance_of', id('Note-2'));
    const unlinked = engine.admin.addRelation(id('Trace-3'), 'instance_of', id('Note-2'));
    const between = engine.admin.addRelation(id('Note-1'), 'mentions', id('Note-2'));
    await flushed();
    const stored = (rel: EARS.EntityId) => store.envs.volatileBackup.relations.get(rel) ?? store.envs.primary.relations.get(rel);

    tx(id('Note-1')).destroy();
    tx(id('Trace-2')).destroy();
    engine.query.removeRelationById(unlinked);
    await flushed();

    // The run's record still says which node it ran; the node and its own relations are gone
    expect(stored(kept)).toMatchObject({ kind: 'instance_of', src: 'Trace-1', tgt: 'Note-1' });
    expect(stored(between)).toBeUndefined();
    expect(store.query('primary').getEntityMeta('Note-1')).toBeNull();
    expect(stored(withRun)).toBeUndefined();
    expect(stored(unlinked)).toBeUndefined();
    // Memory drops it with the node
    expect(engine.query.findRelations({ sourceEntity: id('Trace-1') })).toEqual([]);
  });

  it("keeps a history link it didn't see written when the other end is destroyed", async () => {
    const store = openStore();
    tx(id('Note-1'), true).put('title', 'ran');
    const rel = engine.admin.addRelation(id('Trace-1'), 'instance_of', id('Note-1'));
    await flushed();
    store.reopen();
    tx(id('Note-1')).destroy();
    await flushed();
    expect(store.envs.volatileBackup.relations.get(rel)).toMatchObject({ src: 'Trace-1', tgt: 'Note-1' });
  });

  it("removes a relation it didn't see written, wherever it is", async () => {
    const store = openStore();
    tx(id('Note-1'), true).put('title', 'a');
    const rel = engine.admin.addRelation(id('Note-1'), 'mentions', id('Trace-1'));
    await flushed();
    expect(store.envs.volatileBackup.relations.get(rel)).toMatchObject({ kind: 'mentions', src: 'Note-1', tgt: 'Trace-1' });
    // A reopened store's sink has no relation cache
    store.reopen();
    engine.query.removeRelationById(rel);
    await flushed();
    expect(store.envs.volatileBackup.relations.get(rel)).toBeUndefined();
  });

  it("moves a relation it didn't see written to its new ends' partition, by the engine's details", async () => {
    const store = openStore();
    tx(id('Note-1'), true).put('title', 'a');
    tx(id('Note-2'), true).put('title', 'b');
    tx(id('Trace-1'), true).put('step', 's');
    const rel = engine.admin.addRelation(id('Note-1'), 'mentions', id('Note-2'), { why: 'x' });
    await flushed();
    expect(store.envs.primary.relations.get(rel)).toMatchObject({ src: 'Note-1', tgt: 'Note-2' });

    store.reopen();
    engine.admin.updateRelation(rel, undefined, id('Trace-1'));
    await flushed();
    expect(store.envs.primary.relations.get(rel)).toBeUndefined();
    expect(store.envs.volatileBackup.relations.get(rel)).toMatchObject({ kind: 'mentions', src: 'Note-1', tgt: 'Trace-1', info: { why: 'x' } });
  });

  it("updates a relation it didn't see written in place when its partition doesn't change", async () => {
    const store = openStore();
    tx(id('Note-1'), true).put('title', 'a');
    tx(id('Note-2'), true).put('title', 'b');
    tx(id('Note-3'), true).put('title', 'c');
    const rel = engine.admin.addRelation(id('Note-1'), 'mentions', id('Note-2'));
    await flushed();
    const { createdAt } = store.envs.primary.relations.get(rel);

    store.reopen();
    await new Promise((resolve) => setTimeout(resolve, 5));
    engine.admin.updateRelation(rel, undefined, id('Note-3'), 'why');
    await flushed();
    expect(store.envs.primary.relations.get(rel)).toEqual({ kind: 'mentions', src: 'Note-1', tgt: 'Note-3', info: 'why', createdAt });
    expect(store.envs.volatileBackup.relations.get(rel)).toBeUndefined();
  });

  it('keeps an entity destroyed right after its writes, and a removed relation, out of the files', async () => {
    const first = openStore();
    tx(id('Note-1'), true).put('title', 'kept');
    tx(id('Note-2'), true).put('title', 'ghost');
    const rel = engine.admin.addRelation(id('Note-1'), 'mentions', id('Note-1'));
    await flushed();
    expect(first.query('primary').getEntityMeta(rel)).not.toBeNull();
    // In the same synchronous block as its writes, before they're flushed
    tx(id('Note-2')).put('title', 'ghost again');
    tx(id('Note-2')).destroy();
    engine.query.removeRelationById(rel);
    await flushed();
    expect(first.query('primary').getEntityMeta('Note-2')).toBeNull();
    expect(first.query('primary').getEntityMeta(rel)).toBeNull();
    first.close();

    const second = openStore();
    await second.hydrate();
    expect(getAttr(id('Note-1'), 'title')).toBe('kept');
    expect(engine.query.getAll(id('Note-2'))).toEqual({});
    expect(getEntitiesOfType('Note')).toEqual(['Note-1']);
    expect(getEntitiesOfType('Relation')).toEqual([]);
  });

  it('opens existing files read-only: it hydrates them, and refuses writes and a reset', async () => {
    const first = openStore();
    tx(id('Note-1'), true).put('title', 'kept').link('mentions', id('Note-2'));
    await flushed();
    first.close();

    const lines: string[] = [];
    const readOnly = openStore({ readOnly: true, log: (line) => lines.push(line) });
    expect(readOnly.readOnly).toBe(true);
    expect(readOnly.paths).toEqual(paths);
    await readOnly.hydrate();
    expect(getAttr(id('Note-1'), 'title')).toBe('kept');
    expect(getEntitiesOfType('Relation')).toHaveLength(1);
    expect(lines).toContain('[LMDB] Hydrating partitions: primary');
    expect(() => tx(id('Note-1')).put('title', 'changed')).toThrow('is open read-only');
    await expect(readOnly.reset()).rejects.toThrow('is open read-only');
    expect(readOnly.close()).toEqual({ errorCount: 0, lastError: null });
    expect(lines).toContain('[LMDB] Environment closed successfully');

    const reopened = openStore();
    expect(reopened.query('primary').getFirstAttr('title', 'Note-1')).toBe('kept');
  });

  it('reports writes lost while it was closed for a reopen or a reset, not only this close\'s', async () => {
    const store = openStore();
    tx(id('Note-1'), true).put('title', 'kept');
    await flushed();
    // JSON can't encode a BigInt: the write fails when the store closes to reopen
    tx(id('Note-1')).put('count', 1n);
    store.reopen();
    expect(store.close()).toMatchObject({ errorCount: 1, lastError: { op: 'final flush' } });
    // Reported once
    expect(store.close()).toEqual({ errorCount: 0, lastError: null });

    const resetting = openStore();
    tx(id('Note-2'), true).put('count', 2n);
    await resetting.reset();
    expect(resetting.close()).toMatchObject({ errorCount: 1 });
  });

  it('opens no database where none exists when read-only', () => {
    expect(() => openStore({ readOnly: true })).toThrow();
    expect(fs.existsSync(paths.primary)).toBe(false);
  });

  it('reports a failed final flush from close, and nothing for a clean or repeated close', async () => {
    const store = openStore();
    tx(id('Note-1'), true).put('title', 'fine');
    await flushed();
    // JSON can't encode a BigInt: the write fails when close flushes it
    tx(id('Note-1')).put('count', 1n);
    const stats = store.close();
    expect(stats.errorCount).toBe(1);
    expect(stats.lastError).toMatchObject({ op: 'final flush' });
    expect(store.close()).toEqual({ errorCount: 0, lastError: null });

    const clean = openStore();
    tx(id('Note-2'), true).put('title', 'fine');
    expect(clean.close()).toEqual({ errorCount: 0, lastError: null });
  });
});

describe('the storage format', () => {
  /** The environment's own records, opened without the format check */
  function meta(basePath: string) {
    const root = openEnv({ path: basePath, maxDbs: 8, compression: true });
    return { db: root.openDB({ name: 'meta', encoding: 'json' }), close: () => root.close() };
  }

  function storedFormat(basePath: string): unknown {
    const { db, close } = meta(basePath);
    try {
      return db.get('format');
    } finally {
      close();
    }
  }

  /** Records `format`, or, without one, the files of a version that recorded none */
  function writeFormat(basePath: string, format?: unknown): void {
    const { db, close } = meta(basePath);
    try {
      if (format === undefined) db.removeSync('format');
      else db.putSync('format', format);
    } finally {
      close();
    }
  }

  it('is recorded in a database this version writes', async () => {
    const store = openStore();
    tx(id('Note-1'), true).put('title', 'kept');
    await flushed();
    store.close();
    expect(storedFormat(paths.primary)).toBe(LMDB_FORMAT_VERSION);
    expect(storedFormat(paths.volatileBackup)).toBe(LMDB_FORMAT_VERSION);
  });

  it('is recorded in files that predate it, once a version that records it writes them', async () => {
    const store = openStore();
    tx(id('Note-1'), true).put('title', 'kept');
    await flushed();
    store.close();
    // Files from before the format was recorded
    writeFormat(paths.primary);
    expect(storedFormat(paths.primary)).toBeUndefined();

    // Reading them records nothing
    openStore({ readOnly: true, log: () => {} }).close();
    expect(storedFormat(paths.primary)).toBeUndefined();

    openStore().close();
    expect(storedFormat(paths.primary)).toBe(LMDB_FORMAT_VERSION);
  });

  it('reads a database written before formats were recorded, which has no meta database at all', async () => {
    // An older version's files: the three databases it wrote, and nothing else
    const root = openEnv({ path: paths.primary, maxDbs: 8, compression: true });
    root.openDB({ name: 'entities', encoding: 'json' }).putSync('Note-1', { type: 'Note', createdAt: 1 });
    root.openDB({ name: 'attrs', encoding: 'json' });
    root.openDB({ name: 'relations', encoding: 'json' });
    root.close();
    const volatile = openEnv({ path: paths.volatileBackup, maxDbs: 8, compression: true });
    volatile.openDB({ name: 'entities', encoding: 'json' });
    volatile.openDB({ name: 'attrs', encoding: 'json' });
    volatile.openDB({ name: 'relations', encoding: 'json' });
    volatile.close();

    // Reading them records nothing, and they read as this format
    const readOnly = openStore({ readOnly: true, log: () => {} });
    await readOnly.hydrate();
    expect(readOnly.query('primary').getEntityMeta('Note-1')).toMatchObject({ type: 'Note' });
    readOnly.close();
    expect(storedFormat(paths.primary)).toBeUndefined();

    openStore().close();
    expect(storedFormat(paths.primary)).toBe(LMDB_FORMAT_VERSION);
  });

  it('refuses a run history in another format, saying it can be deleted, and leaves the files closed', () => {
    openStore().close();
    writeFormat(paths.volatileBackup, LMDB_FORMAT_VERSION + 1);

    expect(() => openStore()).toThrow(
      new RegExp(`storage format ${LMDB_FORMAT_VERSION + 1}[\\s\\S]*run history only: deleting ${paths.volatileBackup} loses that and nothing else`),
    );

    // Deleting it is enough: the data partition was never the problem
    fs.rmSync(paths.volatileBackup, { recursive: true, force: true });
    const store = openStore();
    expect(store.isOpen()).toBe(true);
  });

  it('refuses a directory with no database in it when read-only', () => {
    fs.mkdirSync(paths.primary, { recursive: true });
    expect(() => openStore({ readOnly: true })).toThrow(`No LMDB database at ${paths.primary}`);
  });

  it('refuses another format, saying which, and leaves the files closed', async () => {
    openStore().close();
    writeFormat(paths.primary, LMDB_FORMAT_VERSION + 1);

    const newer = new RegExp(`storage format ${LMDB_FORMAT_VERSION + 1}, but this version reads format ${LMDB_FORMAT_VERSION}: it was written by a newer AgentBuddy`);
    expect(() => openStore()).toThrow(newer);
    expect(() => openStore({ readOnly: true })).toThrow(newer);

    writeFormat(paths.primary, 'nonsense');
    expect(() => openStore()).toThrow(/storage format "nonsense", but this version reads format 1$/);

    // The environment it opened is closed, so the files can be replaced and opened again
    fs.rmSync(paths.primary, { recursive: true, force: true });
    const store = openStore();
    tx(id('Note-1'), true).put('title', 'after');
    await flushed();
    expect(store.query('primary').getFirstAttr('title', 'Note-1')).toBe('after');
    expect(storedFormat(paths.primary)).toBe(LMDB_FORMAT_VERSION);
  });
});
