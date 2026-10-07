// readInstalledSchema reads what the packs installed in a data dir declare, and says which file is wrong when one is
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readInstalledSchema } from '../../src/database/schema.ts';
import { dataDirWithPacks, removeTempDirs, schemaContext } from './fixtures.ts';
import { _appDirOf } from '@abuddy/sdk/env';

afterEach(removeTempDirs);

const manifestFile = (dir: string, id: string) => path.join(_appDirOf(dir), 'packs', id, 'abuddy.json');
const write = (file: string, content: unknown) =>
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));

describe('a file readInstalledSchema cannot use', () => {
  // One kind of file to report on, since every pack is read from its own installed manifest — this named a
  // published snapshot as well, which was the data dir's second account of itself
  it("names the pack's manifest, whichever pack it is", () => {
    const dir = dataDirWithPacks({ external: [{ id: 'bookmarks', entities: { Bookmark: 'Bookmark' } }] });
    write(manifestFile(dir, 'bookmarks'), { id: 'bookmarks', name: 'Bookmarks', version: '1.0.0', relKinds: 'nonsense' });
    expect(() => readInstalledSchema(schemaContext(dir))).toThrow(`${manifestFile(dir, 'bookmarks')}: the manifest's relKinds isn't a set of names`);
  });

  // The pack the app ships is read exactly the same way, from the same place
  it("names the manifest of a pack the app ships", () => {
    const dir = dataDirWithPacks();
    write(manifestFile(dir, 'core'), { id: 'core', name: 'Core', version: '1.0.0', entities: ['Note'] });
    expect(() => readInstalledSchema(schemaContext(dir))).toThrow(`${manifestFile(dir, 'core')}: the manifest's entities isn't a set of names`);
  });

  it("refuses a registry it can't read, rather than taking in packs the app leaves out", () => {
    const dir = dataDirWithPacks({ external: [{ id: 'off', entities: { Hidden: 'Hidden' }, enabled: false }] });
    const registry = path.join(_appDirOf(dir), 'installed-packs.json');
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
