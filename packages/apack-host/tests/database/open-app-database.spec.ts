// openAppDatabase: a data dir's database opened outside the app, from the installed packs' manifests, in the layout
// it was written in
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createEarsEngine, getEntitiesOfType, installEngine, installedEngine, untypedQx, type EARS } from '@apack/ears';
import { _appDataPaths } from '@apack/sdk/utils';
import { openAppDatabase } from '../../src/database/open.ts';
import { findAppDataPaths } from '../../src/database/layout.ts';
import { readInstalledSchema } from '../../src/database/schema.ts';
import { dataDirWithPacks, removeTempDirs, schemaContext, tempDir, untypedTx, writeData } from './fixtures.ts';
import { _appDirOf } from '@apack/sdk/env';

afterEach(removeTempDirs);

const id = (name: string) => name as EARS.EntityId;
const quiet = { log: () => {} };

describe('readInstalledSchema', () => {
  it("takes entity types from every enabled pack's own manifest, the app's own packs included", () => {
    const dir = dataDirWithPacks({
      external: [
        { id: 'bookmarks', entities: { Bookmark: 'Bookmark' } },
        { id: 'listed', entities: { Pin: 'Pin' }, enabled: true },
        { id: 'off', entities: { Hidden: 'Hidden' }, enabled: false },
      ],
    });
    const schema = readInstalledSchema(schemaContext(dir));
    const types = schema.getRegisteredEntityTypes();
    for (const type of ['Note', 'Trace', 'Bookmark', 'Pin', 'Flow', 'Relation', 'AppState']) expect(types.has(type)).toBe(true);
    expect(types.has('Hidden')).toBe(false);
    expect(schema.relKinds.MENTIONS).toBe('mentions');
    expect(schema.packs).toEqual([
      { id: 'bookmarks' },
      { id: 'core' },
      { id: 'listed' },
    ]);
  });

  // It used to throw, which is wrong for a tool whose job is looking at a data dir something is already wrong
  // with. It reports instead, and the caller decides: a dir with no published snapshots still opens and every
  // row is still reachable by id — what is lost is naming a pack's entity type in a query.
  // A data dir with nothing installed knows the app's own types and no pack's, which is the truth about it
  // rather than an incomplete reading of it — every pack that is there has its manifest there
  it('knows only the app\'s own types for a data dir with no packs installed', () => {
    const dir = tempDir('host-database-');
    const schema = readInstalledSchema(schemaContext(dir));
    expect(schema.packs).toEqual([]);
    expect(schema.degraded, 'reported, because a caller about to write needs to know').toMatch(/has no packs installed .*--schema-from/s);
    expect(schema.getRegisteredEntityTypes().has('AppState'), "the app's own types are still known").toBe(true);
    expect(schema.getRegisteredEntityTypes().has('Bookmark'), "a pack's are not").toBe(false);
  });

  // A flag that does nothing and says nothing is worse than one that errors: the path was only resolved when
  // the dir had no snapshots, so a typo against a healthy dir answered normally
  it('resolves the named snapshot even when it will not be needed, and says it was not', () => {
    const dir = dataDirWithPacks();
    expect(() => readInstalledSchema(schemaContext(dir), { schemaFrom: '/nope/x.json' })).toThrow(/No pack snapshot at/);

    const snapshot = path.join(dir, 'spare.json');
    fs.writeFileSync(snapshot, JSON.stringify({ manifest: { id: 'spare', entities: {} } }));
    // Named a pack the dir does not have, so it is read and added
    const { notes } = readInstalledSchema(schemaContext(dir), { schemaFrom: snapshot });
    expect(notes).toEqual([]);
  });

  // The snapshot a caller names stands in for the ones the data dir never published
  it('reads the entity types from a snapshot --schema-from names', () => {
    const dir = tempDir('host-database-');
    const snapshot = path.join(dir, 'snapshot.json');
    fs.writeFileSync(snapshot, JSON.stringify({ manifest: { id: 'named', entities: { Bookmark: 'Bookmark' } } }));
    const schema = readInstalledSchema(schemaContext(dir), { schemaFrom: snapshot });
    expect(schema.getRegisteredEntityTypes().has('Bookmark')).toBe(true);
  });
});

describe('findAppDataPaths', () => {
  it('refuses a data dir holding only one of the two partitions, whether it reads or writes', async () => {
    const dir = dataDirWithPacks();
    await writeData(dir, () => {});
    const paths = _appDataPaths(dir);
    fs.rmSync(paths.volatileLmdb, { recursive: true });
    const missingHistory = new RegExp(`missing the run history \\(${paths.volatileLmdb}\\): copy the whole data dir`);
    expect(() => findAppDataPaths(dir)).toThrow(missingHistory);
    await expect(openAppDatabase({ env: 'test', userDataDir: dir, readOnly: true, ...quiet })).rejects.toThrow(missingHistory);
    // A write doesn't quietly make the missing partition either
    await expect(openAppDatabase({ env: 'test', userDataDir: dir, ...quiet })).rejects.toThrow(missingHistory);
    expect(fs.existsSync(paths.volatileLmdb)).toBe(false);

    const onlyHistory = dataDirWithPacks();
    await writeData(onlyHistory, () => {});
    fs.rmSync(_appDataPaths(onlyHistory).lmdb, { recursive: true });
    expect(() => findAppDataPaths(onlyHistory)).toThrow(/missing the data \(/);
  });

  it('refuses a data dir with no database', async () => {
    const dir = dataDirWithPacks();
    expect(() => findAppDataPaths(dir)).toThrow(`No apack database in ${dir}`);
  });

  // The stores live under `appDir`, not beside Chromium's files. A dir holding only the old layout reads as
  // empty rather than as a database, which is the honest answer: nothing here writes there any more.
  it('does not read the layout the app wrote before it had a directory of its own', async () => {
    const dir = dataDirWithPacks();
    // Deliberately the two places the app wrote before `appDir`, spelled out rather than derived: the point
    // is that neither is read any more, which a helper that knows the current layout could not express
    fs.mkdirSync(path.join(dir, 'ears-db'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.data', 'ears-db'), { recursive: true });
    expect(() => findAppDataPaths(dir)).toThrow(`No apack database in ${dir}`);
  });
});

describe('openAppDatabase', () => {
  /**
   * The firing case for the refusal, and the reason it exists rather than a warning. With an incomplete schema
   * the engine does not know `Note` is an entity type, so `tx('Note')` takes the name for an *id* and writes a
   * row literally called `Note` — measured against a real data dir before this refusal existed. A read of the
   * same dir is fine and is the whole point of the fallback.
   */
  // A dir whose packs were removed still holds their rows — uninstalling deletes a directory, not rows — so
  // "no pack installed" is a schema that cannot be written against, however true it is about the directory
  it('refuses a writable open on a data dir whose packs were removed, and allows a read', async () => {
    const dir = dataDirWithPacks();
    await writeData(dir, () => {});
    fs.rmSync(path.join(_appDirOf(dir), 'packs'), { recursive: true });

    await expect(openAppDatabase({ env: 'test', userDataDir: dir, ...quiet }))
      .rejects.toThrow(/has no packs installed .*an incomplete schema would write the wrong rows/s);

    const db = await openAppDatabase({ env: 'test', userDataDir: dir, readOnly: true, ...quiet });
    try {
      expect(db.schema.packs).toEqual([]);
      expect(db.schema.getRegisteredEntityTypes().has('Note')).toBe(false);
    } finally {
      db.close();
    }
  });

  // The escape hatch the refusal names, so the message is not a dead end
  it('takes the schema a caller names, and then writes', async () => {
    const dir = dataDirWithPacks();
    await writeData(dir, () => {});
    fs.rmSync(path.join(_appDirOf(dir), 'packs'), { recursive: true });
    const snapshot = path.join(dir, 'core.json');
    fs.writeFileSync(snapshot, JSON.stringify({ manifest: { id: 'core', entities: { Note: 'Note' } } }));

    const db = await openAppDatabase({ env: 'test', userDataDir: dir, schemaFrom: snapshot, ...quiet });
    try {
      expect(db.schema.degraded).toBeUndefined();
      expect(db.query.tx('Note').put('title', 'new').id().startsWith('Note-')).toBe(true);
    } finally {
      db.close();
    }
  });

  it('hydrates the primary partition with the installed types, and installs the engine until close', async () => {
    const dir = dataDirWithPacks();
    await writeData(dir, () => {
      untypedTx(id('Note-1'), true).put('entityType', 'Note').put('title', 'kept').grant('pinned').link('mentions', id('Note-2'));
      untypedTx(id('Note-2'), true).put('entityType', 'Note').put('title', 'other');
      untypedTx(id('TNode-1'), true).put('step', 'volatile');
    });

    const db = await openAppDatabase({ env: 'test', userDataDir: dir, ...quiet });
    expect(installedEngine()).toBe(db.query);
    expect(db.paths).toEqual(_appDataPaths(dir));
    expect(getEntitiesOfType('Note').sort()).toEqual(['Note-1', 'Note-2']);
    expect(untypedQx('Note').ids()).toHaveLength(2);
    expect(db.query.getRoles(id('Note-1'))).toEqual(['pinned']);
    expect(db.query.findRelations({ sourceEntity: id('Note-1') })).toHaveLength(1);
    // The volatile partition isn't hydrated, as in the app
    expect(db.query.getAttr(id('TNode-1'), 'step')).toBeNull();
    db.close();

    const withHistory = await openAppDatabase({ env: 'test', userDataDir: dir, includeVolatile: true, ...quiet });
    expect(withHistory.query.getAttr(id('TNode-1'), 'step')).toBe('volatile');
    expect(withHistory.query.getAttr(id('Note-1'), 'title')).toBe('kept');
    withHistory.close();

    const db2 = await openAppDatabase({ env: 'test', userDataDir: dir, ...quiet });
    expect(db2.query.getAttr(id('TNode-1'), 'step')).toBeNull();
    // An entity type creates an entity
    const created = db2.query.tx('Note').put('title', 'new').id();
    expect(created.startsWith('Note-')).toBe(true);
    db2.close();
    expect(() => installedEngine()).toThrow();

    const again = await openAppDatabase({ env: 'test', userDataDir: dir, readOnly: true, ...quiet });
    expect(again.query.getAttr(created, 'title')).toBe('new');
    again.close();
  });

  it('refuses writes when read-only, and leaves the files as they were', async () => {
    const dir = dataDirWithPacks();
    await writeData(dir, () => { untypedTx(id('Note-1'), true).put('title', 'kept'); });
    const db = await openAppDatabase({ env: 'test', userDataDir: dir, readOnly: true, ...quiet });
    expect(() => db.query.tx(id('Note-1')).put('title', 'changed')).toThrow(/open read-only/);
    db.close();
    const again = await openAppDatabase({ env: 'test', userDataDir: dir, readOnly: true, ...quiet });
    expect(again.query.getAttr(id('Note-1'), 'title')).toBe('kept');
    again.close();
  });

  it('throws from close when a write failed to reach the files', async () => {
    const dir = dataDirWithPacks();
    await writeData(dir, () => { untypedTx(id('Note-1'), true).put('title', 'kept'); });
    const db = await openAppDatabase({ env: 'test', userDataDir: dir, ...quiet });
    // JSON can't encode a BigInt
    db.query.tx(id('Note-1')).put('count', 1n);
    expect(() => db.close()).toThrow(/1 write\(s\) didn't reach the database in .*BigInt/);
    expect(() => installedEngine()).toThrow();
  });

  it('puts back the engine that was installed before, however it ends', async () => {
    const dir = dataDirWithPacks();
    await writeData(dir, () => { untypedTx(id('Note-1'), true).put('title', 'kept'); });
    // A process that already has an engine: the app, or a test file that started a runtime
    const outer = createEarsEngine({ isEntityType: (name) => name === 'Note' });
    installEngine(outer.query);
    try {
      const db = await openAppDatabase({ env: 'test', userDataDir: dir, ...quiet });
      expect(installedEngine()).toBe(db.query);
      db.close();
      expect(installedEngine()).toBe(outer.query);

      // And an open that fails installs nothing at all, rather than leaving this process without an engine
      const broken = dataDirWithPacks();
      await expect(openAppDatabase({ env: 'test', userDataDir: broken, ...quiet })).rejects.toThrow();
      expect(installedEngine()).toBe(outer.query);
    } finally {
      installEngine(undefined);
    }
  });

  it('opens nothing where the data dir has no database', async () => {
    const dir = dataDirWithPacks();
    await expect(openAppDatabase({ env: 'test', userDataDir: dir, readOnly: true, ...quiet })).rejects.toThrow('No apack database');
    expect(fs.existsSync(path.join(dir, '.data'))).toBe(false);
  });
});
