// readInstalledSchema reads what the packs installed in a data dir declare, and says which file is wrong when one is
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readInstalledSchema } from '../../src/database/schema.ts';
import { pruneHostPackOutputs } from '../../src/packs/pack-layout.ts';
import { dataDirWithPacks, removeTempDirs, schemaContext } from './fixtures.ts';

afterEach(removeTempDirs);

const snapshotFile = (dir: string, id = 'core') => path.join(dir, 'host-packs', id, 'types', 'snapshot.json');
const manifestFile = (dir: string, id: string) => path.join(dir, 'packs', id, 'abuddy.json');
const write = (file: string, content: unknown) =>
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));

describe('a file readInstalledSchema cannot use', () => {
  it("names the built-in pack's snapshot", () => {
    const dir = dataDirWithPacks();
    write(snapshotFile(dir), 'not json');
    expect(() => readInstalledSchema(schemaContext(dir))).toThrow(`${snapshotFile(dir)} isn't readable a built-in pack's snapshot`);

    write(snapshotFile(dir), { types: {} });
    expect(() => readInstalledSchema(schemaContext(dir))).toThrow(`${snapshotFile(dir)} holds no pack manifest`);

    write(snapshotFile(dir), { manifest: { id: 'core', entities: ['Note'] } });
    expect(() => readInstalledSchema(schemaContext(dir))).toThrow(`${snapshotFile(dir)}: the manifest's entities isn't a set of names`);
  });

  it("names the external pack's manifest", () => {
    const dir = dataDirWithPacks({ external: [{ id: 'bookmarks', entities: { Bookmark: 'Bookmark' } }] });
    write(manifestFile(dir, 'bookmarks'), { id: 'bookmarks', name: 'Bookmarks', version: '1.0.0', relKinds: 'nonsense' });
    expect(() => readInstalledSchema(schemaContext(dir))).toThrow(`${manifestFile(dir, 'bookmarks')}: the manifest's relKinds isn't a set of names`);
  });

  it("refuses a registry it can't read, rather than taking in packs the app leaves out", () => {
    const dir = dataDirWithPacks({ external: [{ id: 'off', entities: { Hidden: 'Hidden' }, enabled: false }] });
    const registry = path.join(dir, 'installed-packs.json');
    expect(readInstalledSchema(schemaContext(dir)).getRegisteredEntityTypes().has('Hidden')).toBe(false);

    write(registry, 'not json');
    expect(() => readInstalledSchema(schemaContext(dir))).toThrow(`${registry} isn't readable the installed packs`);
    write(registry, { packs: 'nonsense' });
    expect(() => readInstalledSchema(schemaContext(dir))).toThrow(`${registry} lists no installed packs`);
  });
});

describe('packs declaring the same name', () => {
  it('are refused, as the app refuses to register them', () => {
    const colliding = dataDirWithPacks({ external: [{ id: 'a', entities: { Shared: 'Shared' } }, { id: 'b', entities: { Shared: 'Shared' } }] });
    expect(() => readInstalledSchema(schemaContext(colliding))).toThrow('Two packs declare the entity type Shared: "a" and "b"');

    const overApp = dataDirWithPacks({ external: [{ id: 'a', entities: { Flow: 'Flow' } }] });
    expect(() => readInstalledSchema(schemaContext(overApp))).toThrow('Two packs declare the entity type Flow: "AgentBuddy" and "a"');
  });
});

describe('pruneHostPackOutputs', () => {
  it('removes the artifacts of built-in packs the app no longer has, and keeps the rest', () => {
    const dir = dataDirWithPacks();
    const hostPacks = path.join(dir, 'host-packs');
    fs.cpSync(path.join(hostPacks, 'core'), path.join(hostPacks, 'dropped'), { recursive: true });
    fs.mkdirSync(path.join(hostPacks, '.core.publishing-123-abc'), { recursive: true });

    expect(pruneHostPackOutputs(hostPacks, ['core'])).toEqual(['dropped']);
    expect(fs.readdirSync(hostPacks).sort()).toEqual(['.core.publishing-123-abc', 'core']);
    expect(pruneHostPackOutputs(hostPacks, ['core'])).toEqual([]);
    expect(pruneHostPackOutputs(path.join(dir, 'nowhere'), ['core'])).toEqual([]);
  });
});
