// openLmdbStore: the engine's writes reach LMDB through store.sink, and a store opened again on the same
// paths hydrates them back
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEarsEngine, installEngine, makePolicy, tx, getEntitiesOfType, type EARS, type EarsEngine } from '../../src/index.ts';
import { openLmdbStore, type LmdbStore } from '../../src/lmdb/index.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ears-lmdb-store-'));
const policy = makePolicy({ excludedEntityTypes: new Set(['Trace']) });
let paths: { primary: string; volatileBackup: string };
const open: LmdbStore[] = [];
let engine: EarsEngine;

/** A store and a new engine persisting to it, installed, as an app's composition opens them */
function openStore(): LmdbStore {
  const store = openLmdbStore({ paths, policy, engine: () => engine.admin });
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

  it("routes a relation it didn't see written by the engine's details", async () => {
    const store = openStore();
    tx(id('Note-1'), true).put('title', 'a');
    const rel = engine.admin.addRelation(id('Note-1'), 'mentions', id('Trace-1'));
    await flushed();
    expect(store.envs.volatileBackup.relations.get(rel)).toMatchObject({ kind: 'mentions', src: 'Note-1', tgt: 'Trace-1' });
    // A reopened store's sink has no relation cache: removing the relation reads its ends from the engine
    store.reopen();
    engine.query.removeRelationById(rel);
    await flushed();
    expect(store.envs.volatileBackup.relations.get(rel)).toBeUndefined();
  });
});
