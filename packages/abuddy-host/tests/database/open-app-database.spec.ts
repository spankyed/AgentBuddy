// openAppDatabase: a data dir's database opened outside the app, from the installed packs' manifests, in the layout
// it was written in, checked against the version the tool supports
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getEntitiesOfType, installedEngine, untypedQx, type EARS } from '@abuddy/ears';
import { appDataPaths } from '@abuddy/sdk/utils';
import { openAppDatabase } from '../../src/database/open.ts';
import { findAppDataPaths } from '../../src/database/layout.ts';
import { readInstalledSchema } from '../../src/database/schema.ts';
import { DataVersionMismatchError, checkDataVersion } from '../../src/database/version.ts';
import { recordHostVersion } from '../../src/packs/host-info.ts';
import { dataDirWithPacks, removeTempDirs, schemaContext, tempDir, tx, writeData } from './fixtures.ts';

afterEach(removeTempDirs);

const id = (name: string) => name as EARS.EntityId;
const quiet = { log: () => {} };

describe('readInstalledSchema', () => {
  it("takes entity types from the built-in snapshots and the enabled external packs' manifests", () => {
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
      { id: 'core', builtIn: true },
      { id: 'bookmarks', builtIn: false },
      { id: 'listed', builtIn: false },
    ]);
  });

  it("routes the built-in packs' excluded types (and the SDK's) to the volatile partition, never an external pack's", () => {
    const dir = dataDirWithPacks({ external: [{ id: 'bookmarks', entities: { Bookmark: 'Bookmark' } }] });
    const { partitionPolicy } = readInstalledSchema(schemaContext(dir));
    expect(partitionPolicy.routeEntity('Trace-1')).toBe('volatileBackup');
    expect(partitionPolicy.routeEntity('TNode-1')).toBe('volatileBackup');
    expect(partitionPolicy.routeEntity('Note-1')).toBe('primary');
    expect(partitionPolicy.routeEntity('Bookmark-1')).toBe('primary');
  });

  it('refuses a data dir the app never published its built-in packs to', () => {
    const dir = tempDir('host-database-');
    expect(() => readInstalledSchema(schemaContext(dir))).toThrow(/has no built-in packs .*start AgentBuddy on it once/);
  });
});

describe('findAppDataPaths', () => {
  it('finds the layout the database was written in', async () => {
    const source = dataDirWithPacks();
    await writeData(source, () => {});
    expect(findAppDataPaths(source)).toEqual(appDataPaths(source, { packaged: false }));

    const packaged = dataDirWithPacks();
    await writeData(packaged, () => {}, { packaged: true });
    expect(findAppDataPaths(packaged)).toEqual(appDataPaths(packaged, { packaged: true }));
  });

  it('refuses a data dir with no database, or one in each layout', async () => {
    const dir = dataDirWithPacks();
    expect(() => findAppDataPaths(dir)).toThrow(`No AgentBuddy database in ${dir}`);
    await writeData(dir, () => {});
    await writeData(dir, () => {}, { packaged: true });
    expect(() => findAppDataPaths(dir)).toThrow(/holds two AgentBuddy databases/);
  });
});

describe('openAppDatabase', () => {
  it('hydrates the primary partition with the installed types, and installs the engine until close', async () => {
    const dir = dataDirWithPacks();
    await writeData(dir, () => {
      tx(id('Note-1'), true).put('entityType', 'Note').put('title', 'kept').grant('pinned').link('mentions', id('Note-2'));
      tx(id('Note-2'), true).put('entityType', 'Note').put('title', 'other');
      tx(id('Trace-1'), true).put('step', 'volatile');
    });

    const db = await openAppDatabase({ env: 'test', userDataDir: dir, ...quiet });
    expect(installedEngine()).toBe(db.query);
    expect(db.paths).toEqual(appDataPaths(dir, { packaged: false }));
    expect(getEntitiesOfType('Note').sort()).toEqual(['Note-1', 'Note-2']);
    expect(untypedQx('Note' as never).ids()).toHaveLength(2);
    expect(db.query.getRoles(id('Note-1'))).toEqual(['pinned']);
    expect(db.query.findRelations({ sourceEntity: id('Note-1') })).toHaveLength(1);
    // The volatile partition isn't hydrated, as in the app
    expect(db.query.getAttr(id('Trace-1'), 'step')).toBeNull();
    // An entity type creates an entity
    const created = db.query.tx('Note' as never).put('title', 'new').id();
    expect(created.startsWith('Note-')).toBe(true);
    db.close();
    expect(() => installedEngine()).toThrow();

    const again = await openAppDatabase({ env: 'test', userDataDir: dir, readOnly: true, ...quiet });
    expect(again.query.getAttr(created, 'title')).toBe('new');
    again.close();
  });

  it('refuses writes when read-only, and leaves the files as they were', async () => {
    const dir = dataDirWithPacks();
    await writeData(dir, () => { tx(id('Note-1'), true).put('title', 'kept'); });
    const db = await openAppDatabase({ env: 'test', userDataDir: dir, readOnly: true, ...quiet });
    expect(() => db.query.tx(id('Note-1')).put('title', 'changed')).toThrow(/open read-only/);
    db.close();
    const again = await openAppDatabase({ env: 'test', userDataDir: dir, readOnly: true, ...quiet });
    expect(again.query.getAttr(id('Note-1'), 'title')).toBe('kept');
    again.close();
  });

  it('throws from close when a write failed to reach the files', async () => {
    const dir = dataDirWithPacks();
    await writeData(dir, () => { tx(id('Note-1'), true).put('title', 'kept'); });
    const db = await openAppDatabase({ env: 'test', userDataDir: dir, ...quiet });
    // JSON can't encode a BigInt
    db.query.tx(id('Note-1')).put('count', 1n);
    expect(() => db.close()).toThrow(/1 write\(s\) didn't reach the database in .*BigInt/);
    expect(() => installedEngine()).toThrow();
  });

  it("records the data's version: AppState's, else the app's that last ran on it", async () => {
    const dir = dataDirWithPacks();
    await writeData(dir, () => {});
    const unversioned = await openAppDatabase({ env: 'test', userDataDir: dir, ...quiet });
    expect(unversioned.dataVersion).toBeUndefined();
    unversioned.close();

    recordHostVersion(dir, '0.3.16');
    const fromHost = await openAppDatabase({ env: 'test', userDataDir: dir, ...quiet });
    expect(fromHost.dataVersion).toBe('0.3.16');
    fromHost.close();

    await writeData(dir, () => { tx(id('AppState-app'), true).put('version', '0.3.15'); });
    const fromData = await openAppDatabase({ env: 'test', userDataDir: dir, ...quiet });
    expect(fromData.dataVersion).toBe('0.3.15');
    fromData.close();
  });

  it('refuses data of another minor version, naming both, and closes what it opened', async () => {
    const dir = dataDirWithPacks();
    await writeData(dir, () => { tx(id('AppState-app'), true).put('version', '0.2.9'); });
    const opening = openAppDatabase({ env: 'test', userDataDir: dir, supportedVersion: '0.3.14', ...quiet });
    await expect(opening).rejects.toThrow(DataVersionMismatchError);
    await expect(opening).rejects.toThrow(/AgentBuddy 0\.2\.9.*supports AgentBuddy 0\.3\.14/);
    expect(() => installedEngine()).toThrow();

    // The files were closed: they open again
    const same = await openAppDatabase({ env: 'test', userDataDir: dir, supportedVersion: '0.2.1', ...quiet });
    same.close();
  });

  it('opens nothing where the data dir has no database', async () => {
    const dir = dataDirWithPacks();
    await expect(openAppDatabase({ env: 'test', userDataDir: dir, readOnly: true, ...quiet })).rejects.toThrow('No AgentBuddy database');
    expect(fs.existsSync(path.join(dir, '.data'))).toBe(false);
  });
});

describe('checkDataVersion', () => {
  it('accepts the same major and minor version, a prerelease counting as its release', () => {
    expect(() => checkDataVersion('0.3.1', '0.3.14')).not.toThrow();
    expect(() => checkDataVersion('0.3.15-beta.2', '0.3.14')).not.toThrow();
    expect(() => checkDataVersion('0.3.14', '0.3.15-beta.1')).not.toThrow();
    expect(() => checkDataVersion(undefined, '0.3.14')).not.toThrow();
  });

  it('refuses another major or minor version, or a version it cannot read', () => {
    expect(() => checkDataVersion('0.4.0', '0.3.14')).toThrow(DataVersionMismatchError);
    expect(() => checkDataVersion('1.3.0', '0.3.14')).toThrow(DataVersionMismatchError);
    expect(() => checkDataVersion('0.2.14', '0.3.14')).toThrow(DataVersionMismatchError);
    expect(() => checkDataVersion('not a version', '0.3.14')).toThrow(DataVersionMismatchError);
  });
});
