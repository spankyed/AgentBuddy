// readInstalledSchema reads what the packs installed in a data dir declare, and says which file is wrong when one is
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readInstalledSchema } from '../../src/database/schema.ts';
import { writeInstalledPackFixture } from '../packs/runtime/artifact-fixture.ts';
import { dataDirWithPacks, removeTempDirs, schemaContext } from './fixtures.ts';
import { _appDirOf } from '@apackdev/sdk/env';

afterEach(removeTempDirs);

const manifestFile = (dir: string, id: string) => path.join(_appDirOf(dir), 'packs', id, 'apack.json');
const write = (file: string, content: unknown) =>
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));

describe('a file readInstalledSchema cannot use', () => {
  // One kind of file to report on, since every pack is read from its own installed manifest: whichever pack
  // is wrong, what the error names is an `apack.json` under `packs/`
  it("names the pack's manifest, whichever pack it is", () => {
    const dir = dataDirWithPacks({ external: [{ id: 'bookmarks', entities: { Bookmark: 'Bookmark' } }] });
    write(manifestFile(dir, 'bookmarks'), { id: 'bookmarks', name: 'Bookmarks', version: '1.0.0', data: { relations: 'nonsense' } });
    expect(() => readInstalledSchema(schemaContext(dir))).toThrow(`Pack "bookmarks" declarations in ${path.dirname(manifestFile(dir, 'bookmarks'))}: its manifest does not match its built declarations`);
  });

  // The pack the app ships is read exactly the same way, from the same place
  it("names the manifest of a pack the app ships", () => {
    const dir = dataDirWithPacks();
    write(manifestFile(dir, 'core'), { id: 'core', name: 'Core', version: '1.0.0', data: { entities: ['Note'] } });
    expect(() => readInstalledSchema(schemaContext(dir))).toThrow(`Pack "core" declarations in ${path.dirname(manifestFile(dir, 'core'))}: its manifest does not match its built declarations`);
  });

  it("refuses a registry it can't read, rather than taking in packs the app leaves out", () => {
    const dir = dataDirWithPacks({ external: [{ id: 'off', entities: { Hidden: 'Hidden' }, enabled: false }] });
    const registry = path.join(_appDirOf(dir), 'installed-packs.json');
    expect(readInstalledSchema(schemaContext(dir)).getRegisteredEntityTypes().has('Hidden')).toBe(false);

    write(registry, 'not json');
    expect(() => readInstalledSchema(schemaContext(dir))).toThrow(`Cannot read ${registry}`);
    write(registry, { packs: 'nonsense' });
    expect(() => readInstalledSchema(schemaContext(dir))).toThrow(`Cannot read ${registry}: Invalid installed pack records`);
  });
});

describe('packs declaring the same name', () => {
  it('are refused, as the app refuses to register them', () => {
    const colliding = dataDirWithPacks({ external: [{ id: 'a', entities: { Shared: 'Shared' } }, { id: 'b', entities: { Shared: 'Shared' } }] });
    expect(() => readInstalledSchema(schemaContext(colliding))).toThrow('Two packs declare the entity type Shared: "a" and "b"');

    const overApp = dataDirWithPacks({ external: [{ id: 'a', entities: { Flow: 'Flow' } }] });
    expect(() => readInstalledSchema(schemaContext(overApp))).toThrow('"Flow" is defined by the SDK and available to every pack: remove it');
  });
});

it('discovers feature-owned typed and untyped entities without authored source or executable imports', () => {
  const dir = dataDirWithPacks();
  const packDir = path.dirname(manifestFile(dir, 'offline'));
  writeInstalledPackFixture(packDir, {
    id: 'offline', name: 'Offline', version: '1.0.0',
    data: { relations: ['note_link'] },
    features: { notes: { description: 'Feature declaration fixture.', entities: { OfflineNote: 'src/types.ts#NoteShape', OfflineIndex: null } } },
  });
  expect(fs.existsSync(path.join(packDir, 'src'))).toBe(false);
  const schema = readInstalledSchema(schemaContext(dir));
  expect(schema.entities.OfflineNote).toBe('OfflineNote');
  expect(schema.entities.OfflineIndex).toBe('OfflineIndex');
  expect(schema.relKinds.NOTE_LINK).toBe('note_link');
});
