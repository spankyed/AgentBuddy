// The generic seeder's change tracking at its edges: a row whose seeded values weren't recorded, rows two
// packs' records both identify, and an update hook that fails part way.
import { installedEngine as ears } from '@abuddy/ears';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dropAttribute, resetTestData, startTestRuntime, testPacks } from '../../src/testing/index.ts';
import { createSeeder, markSeededRowUnedited } from '../../src/seed/seeder.ts';
import type { SeedHooks } from '../../src/seed/hooks.ts';
import { getMediaPath } from '../../src/utils/index.ts';
import type { SeedRecord } from '../../src/build/seeds/records.ts';
import type { EARS } from '../../src/types/entities.ts';

type Memo = { id: EARS.EntityId; name: string; body: string; pinned?: boolean; mood?: string; sourceHash?: string; seededFields?: { fields: string[] } };
const memos = (name: string) => ears().findWhere<Memo>('Memo' as EARS.Entity, 'name', name);
const memo = (name: string) => memos(name)[0];
const edit = (name: string, fields: Partial<Memo>) => ears().updateEntity(memo(name).id, fields);

/** Seed hooks the entity's owning pack registers */
const registerHooks = (entity: string, hooks: SeedHooks<SeedRecord>) => testPacks.seedHooks.set(entity, hooks as SeedHooks);

const dirs: string[] = [];
let dataDir: string;
beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seeder-data-'));
  process.env.ABUDDY_ENV ??= 'test';
  process.env.ABUDDY_USER_DATA_DIR ??= dataDir;
  startTestRuntime({ entityTypes: ['Memo', 'Folder'] });
});
beforeEach(() => resetTestData());
afterEach(() => testPacks.seedHooks.clear());
afterAll(() => {
  for (const dir of [...dirs, dataDir]) fs.rmSync(dir, { recursive: true, force: true });
});

/** A pack's compiled memos entry: each record's sourceHash is its version, as a changed source's would change */
function compiled(packId: string, records: Array<{ name: string; body: string; version?: string; [field: string]: unknown }>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seeder-'));
  dirs.push(dir);
  fs.writeFileSync(path.join(dir, 'seeds.json'), JSON.stringify({ version: 1, packId, seeds: [] }));
  const seedRecords: SeedRecord[] = records.map(({ version = 'v1', ...fields }) => ({ entity: 'Memo', ...fields, sourceHash: `${fields.name}-${version}` }));
  fs.writeFileSync(path.join(dir, 'memos.seed.json'), JSON.stringify({ records: seedRecords }));
  return dir;
}

const seeder = createSeeder({ key: 'memos', entities: ['Memo', 'Folder'], identity: ['name'] });
const seed = (dir: string) => seeder.seed({ compiledDir: dir, mode: 'replace-on-collision', log: () => {} });

describe('a row whose seeded values were not recorded', () => {
  it("is left alone when its record changes: it can't be checked for edits", () => {
    seed(compiled('pack-a', [{ name: 'Intro', body: 'Hello' }]));
    dropAttribute(memo('Intro').id, 'seededFields');
    expect(seed(compiled('pack-a', [{ name: 'Intro', body: 'Hello again', version: 'v2' }]))).toEqual({ created: 0, updated: 0, skipped: 1 });
    expect(memo('Intro').body).toBe('Hello');
  });

  // Every row an older version seeded is in that state, so without this they would all stay frozen
  it('takes its record again once a migration marks it unedited, and tracks edits from then on', () => {
    seed(compiled('pack-a', [{ name: 'Intro', body: 'Hello' }]));
    dropAttribute(memo('Intro').id, 'seededFields');

    markSeededRowUnedited(memo('Intro').id);

    expect(seed(compiled('pack-a', [{ name: 'Intro', body: 'Hello again', version: 'v2' }]))).toEqual({ created: 0, updated: 1, skipped: 0 });
    expect(memo('Intro').body).toBe('Hello again');

    // The update re-stamped the row with its real fields, so a later edit is honoured as usual
    edit('Intro', { body: 'mine' });
    expect(seed(compiled('pack-a', [{ name: 'Intro', body: 'Hello a third time', version: 'v3' }]))).toEqual({ created: 0, updated: 0, skipped: 1 });
    expect(memo('Intro').body).toBe('mine');
  });

  it('keeps the fields no seed set: marking it unedited clears nothing', () => {
    seed(compiled('pack-a', [{ name: 'Intro', body: 'Hello' }]));
    edit('Intro', { pinned: true });
    dropAttribute(memo('Intro').id, 'seededFields');

    markSeededRowUnedited(memo('Intro').id);
    seed(compiled('pack-a', [{ name: 'Intro', body: 'Hello again', version: 'v2' }]));

    expect(memo('Intro')).toMatchObject({ body: 'Hello again', pinned: true });
  });
});

describe("two packs' records with the same entry key and identity", () => {
  it('seed a row each, and each pack updates only its own', () => {
    expect(seed(compiled('pack-a', [{ name: 'Welcome', body: 'From A' }]))).toMatchObject({ created: 1 });
    expect(seed(compiled('pack-b', [{ name: 'Welcome', body: 'From B' }]))).toMatchObject({ created: 1 });
    expect(memos('Welcome').map((row) => row.body).sort()).toEqual(['From A', 'From B']);

    expect(seed(compiled('pack-b', [{ name: 'Welcome', body: 'From B, revised', version: 'v2' }]))).toEqual({ created: 0, updated: 1, skipped: 0 });
    expect(seed(compiled('pack-a', [{ name: 'Welcome', body: 'From A' }]))).toEqual({ created: 0, updated: 0, skipped: 1 });
    expect(memos('Welcome').map((row) => row.body).sort()).toEqual(['From A', 'From B, revised']);
  });

  it('fail with a rebuild error when the compiled seeds name no pack', () => {
    const dir = compiled('pack-a', [{ name: 'Welcome', body: 'From A' }]);
    fs.writeFileSync(path.join(dir, 'seeds.json'), JSON.stringify({ version: 1, seeds: [] }));
    expect(() => seed(dir)).toThrow(/doesn't name the pack that compiled these seeds: rebuild the pack/);
  });
});

describe("a folder another pack seeded", () => {
  type Folder = { id: EARS.EntityId; name: string; label?: string; seedKey?: string };
  const folders = () => ears().findWhere<Folder>('Folder' as EARS.Entity, 'name', 'internal');
  const contents = (folder: Folder) => ears().qx(folder.id).linksTo('contains', 'Memo' as EARS.Entity, true).pick(['name']).map((row) => row.name as string).sort();

  /** A pack's entry: one folder holding a memo per name, with the pack's own label on the folder */
  function tree(packId: string, memoNames: string[], entryKey = 'memos'): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seeder-tree-'));
    dirs.push(dir);
    fs.writeFileSync(path.join(dir, 'seeds.json'), JSON.stringify({ version: 1, packId, seeds: [] }));
    const records: SeedRecord[] = [{
      entity: 'Folder',
      name: 'internal',
      label: packId,
      sourceHash: `internal-${packId}`,
      children: memoNames.map((name) => ({ entity: 'Memo', name, body: `from ${packId}`, sourceHash: `${name}-v1` })),
    }];
    fs.writeFileSync(path.join(dir, `${entryKey}.seed.json`), JSON.stringify({ records }));
    return dir;
  }

  it('is seeded into, not copied, when its hooks mark it a container', () => {
    registerHooks('Folder', { container: true });

    expect(seed(tree('pack-a', ['welcome.md']))).toEqual({ created: 2, updated: 0, skipped: 0 });
    // The folder is pack-a's; only pack-b's own memo is new
    expect(seed(tree('pack-b', ['theirs.md']))).toEqual({ created: 1, updated: 0, skipped: 1 });

    expect(folders()).toHaveLength(1);
    const [folder] = folders();
    expect(contents(folder)).toEqual(['theirs.md', 'welcome.md']);
    // Left as pack-a seeded it: not updated, not re-keyed
    expect(folder.label).toBe('pack-a');
    expect(folder.seedKey).toMatch(/^pack-a:/);
  });

  it('is found again by the pack seeding into it: seeding it twice adds nothing', () => {
    registerHooks('Folder', { container: true });
    seed(tree('pack-a', ['welcome.md']));
    seed(tree('pack-b', ['theirs.md']));

    expect(seed(tree('pack-b', ['theirs.md']))).toEqual({ created: 0, updated: 0, skipped: 2 });
    expect(folders()).toHaveLength(1);
    expect(contents(folders()[0])).toEqual(['theirs.md', 'welcome.md']);
  });

  it("takes the other pack's new records in keep-existing mode, which skips only rows that exist", () => {
    registerHooks('Folder', { container: true });
    seed(tree('pack-a', ['welcome.md']));

    const counts = seeder.seed({ compiledDir: tree('pack-b', ['theirs.md']), mode: 'keep-existing', log: () => {} });

    expect(counts).toEqual({ created: 1, updated: 0, skipped: 1 });
    expect(contents(folders()[0])).toEqual(['theirs.md', 'welcome.md']);
  });

  it("is shared by two entries of the pack that seeded it, like another pack's", () => {
    registerHooks('Folder', { container: true });
    const docs = createSeeder({ key: 'docs', entities: ['Memo', 'Folder'], identity: ['name'] });
    seed(tree('pack-a', ['welcome.md']));

    expect(docs.seed({ compiledDir: tree('pack-a', ['guide.md'], 'docs'), mode: 'replace-on-collision', log: () => {} }))
      .toEqual({ created: 1, updated: 0, skipped: 1 });

    expect(folders()).toHaveLength(1);
    expect(contents(folders()[0])).toEqual(['guide.md', 'welcome.md']);
  });

  it("is copied when its hooks don't, so a pack never writes into another's rows", () => {
    registerHooks('Folder', {});

    seed(tree('pack-a', ['welcome.md']));
    seed(tree('pack-b', ['theirs.md']));

    expect(folders().map((folder) => folder.label)).toEqual(['pack-a', 'pack-b']);
    expect(folders().map(contents)).toEqual([['welcome.md'], ['theirs.md']]);
  });

  it('is updated as usual by the pack that seeded it', () => {
    registerHooks('Folder', { container: true });
    seed(tree('pack-a', ['welcome.md']));

    const dir = tree('pack-a', ['welcome.md']);
    const file = path.join(dir, 'memos.seed.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as { records: SeedRecord[] };
    data.records[0].label = 'renamed';
    data.records[0].sourceHash = 'internal-pack-a-v2';
    fs.writeFileSync(file, JSON.stringify(data));

    expect(seed(dir)).toMatchObject({ updated: 1 });
    expect(folders()).toHaveLength(1);
    expect(folders()[0].label).toBe('renamed');
  });
});

describe('wipe-and-replace', () => {
  const wipeSeed = (dir: string) => seeder.seed({ compiledDir: dir, mode: 'wipe-and-replace', log: () => {} });
  const folderNames = () => ears().qx('Folder' as EARS.Entity).pick(['name']).map((row) => row.name as string).sort();

  it("removes rows of every entity type the entry seeds, even types its records don't hold", () => {
    ears().createEntityWithDefaults('Folder' as EARS.Entity, { name: 'old folder' });
    ears().createEntityWithDefaults('Memo' as EARS.Entity, { name: 'old memo', body: 'mine' });

    // Only top-level memos: no Folder record, yet the entry seeds folders too
    expect(wipeSeed(compiled('pack-a', [{ name: 'Intro', body: 'Hello' }]))).toEqual({ created: 1, updated: 0, skipped: 0 });

    expect(folderNames()).toEqual([]);
    expect(memos('old memo')).toEqual([]);
    expect(memo('Intro')).toBeDefined();
  });

  it('wipes when the entry has no records', () => {
    ears().createEntityWithDefaults('Memo' as EARS.Entity, { name: 'old memo', body: 'mine' });

    expect(wipeSeed(compiled('pack-a', []))).toEqual({ created: 0, updated: 0, skipped: 0 });

    expect(memos('old memo')).toEqual([]);
  });

  it("leaves entity types the entry doesn't seed", () => {
    const memosOnly = createSeeder({ key: 'memos', entities: ['Memo'], identity: ['name'] });
    ears().createEntityWithDefaults('Folder' as EARS.Entity, { name: 'kept folder' });

    memosOnly.seed({ compiledDir: compiled('pack-a', [{ name: 'Intro', body: 'Hello' }]), mode: 'wipe-and-replace', log: () => {} });

    expect(folderNames()).toEqual(['kept folder']);
  });
});

describe('an update hook that fails part way', () => {
  it("reports the error and leaves the row updatable, not edited: the next seed updates it", () => {
    let failing = true;
    registerHooks('Memo', {
      create: (record) => ears().createEntityWithDefaults('Memo' as EARS.Entity, { name: record.name, body: record.body, pinned: false }).id,
      update: (id, record) => {
        ears().updateEntity(id, { body: record.body });
        if (failing) throw new Error('disk full');
        ears().updateEntity(id, { pinned: record.pinned });
      },
    });
    const pinnedRecord = (version: string, pinned: boolean) => {
      const dir = compiled('demo', [{ name: 'Intro', body: `Hello ${version}`, version }]);
      const file = path.join(dir, 'memos.seed.json');
      const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as { records: SeedRecord[] };
      data.records[0].pinned = pinned;
      fs.writeFileSync(file, JSON.stringify(data));
      return dir;
    };
    seed(pinnedRecord('v1', false));

    const failed = seed(pinnedRecord('v2', true));
    expect(failed).toMatchObject({ updated: 0, errors: ['Memo "Intro": disk full'] });
    expect(memo('Intro')).toMatchObject({ body: 'Hello v2', pinned: false, sourceHash: 'Intro-v1' });

    failing = false;
    expect(seed(pinnedRecord('v2', true))).toEqual({ created: 0, updated: 1, skipped: 0 });
    expect(memo('Intro')).toMatchObject({ body: 'Hello v2', pinned: true, sourceHash: 'Intro-v2' });
  });

  it("keeps the row's previous seeded fields: a field the record newly sets isn't recorded as seeded", () => {
    registerHooks('Memo', {
      update: (id, record) => {
        ears().updateEntity(id, { body: record.body });
        throw new Error('disk full');
      },
    });
    seed(compiled('demo', [{ name: 'Intro', body: 'Hello' }]));
    // The user's mood, which the next version of the record sets too
    edit('Intro', { mood: 'mine' });

    expect(seed(compiled('demo', [{ name: 'Intro', body: 'Hello v2', mood: 'calm', version: 'v2' }]))).toMatchObject({ errors: ['Memo "Intro": disk full'] });
    expect(memo('Intro')).toMatchObject({ mood: 'mine', seededFields: { fields: ['body', 'name'] } });
  });
});

describe('a field a changed record no longer sets', () => {
  it("is dropped from the row, and a field the seed never set is kept", () => {
    seed(compiled('demo', [{ name: 'Intro', body: 'Hello', pinned: true }]));
    edit('Intro', { mood: 'mine' });
    expect(seed(compiled('demo', [{ name: 'Intro', body: 'Hello', version: 'v2' }]))).toEqual({ created: 0, updated: 1, skipped: 0 });
    expect(memo('Intro').pinned).toBeUndefined();
    expect(memo('Intro')).toMatchObject({ mood: 'mine', seededFields: { fields: ['body', 'name'] } });
  });

  it('is passed to the update hook to reset', () => {
    const cleared: string[][] = [];
    registerHooks('Memo', {
      update: (id, record, { clearedFields }) => {
        cleared.push(clearedFields);
        ears().updateEntity(id, { body: record.body, ...(clearedFields.includes('pinned') && { pinned: false }) });
      },
    });
    seed(compiled('demo', [{ name: 'Intro', body: 'Hello', pinned: true }]));
    seed(compiled('demo', [{ name: 'Intro', body: 'Hello', version: 'v2' }]));
    expect(cleared).toEqual([['pinned']]);
    expect(memo('Intro').pinned).toBe(false);
  });
});

describe('a created row that fails before it is tracked', () => {
  it('is removed and the error reported, so the next seed creates it again and tracks it', () => {
    let failing = true;
    registerHooks('Memo', {
      update: (id, record) => {
        if (failing) throw new Error('disk full');
        ears().updateEntity(id, { body: record.body });
      },
    });
    const mediaSeeder = createSeeder({ key: 'memos', entities: ['Memo', 'Folder'], identity: ['name'], media: true });
    const dir = compiled('demo', [{ name: 'Intro', body: 'See ![pic](media/pic.png)' }]);
    fs.mkdirSync(path.join(dir, 'media', 'memos'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'media', 'memos', 'pic.png'), 'PNG');
    const seedMedia = () => mediaSeeder.seed({ compiledDir: dir, mode: 'replace-on-collision', log: () => {} });

    expect(seedMedia()).toMatchObject({ created: 0, errors: ['Memo "Intro": disk full'] });
    expect(memos('Intro')).toEqual([]);

    failing = false;
    expect(seedMedia()).toEqual({ created: 1, updated: 0, skipped: 0 });
    const { id, body } = memo('Intro');
    expect(body).toBe(`See ![pic](media://${id}/pic.png)`);
    expect(fs.readdirSync(getMediaPath())).toEqual([id]);
    expect(seedMedia()).toEqual({ created: 0, updated: 0, skipped: 1 });
  });
});

describe('media links that point outside the media folders', () => {
  it('are left as written, copying nothing in or out', () => {
    const mediaSeeder = createSeeder({ key: 'memos', entities: ['Memo', 'Folder'], identity: ['name'], media: true });
    // `media/../memos/pic.png` reads a file inside the compiled media but would write beside the row's folder
    const dir = compiled('demo', [{ name: 'Escape', body: 'A ![up](media/../../secret.txt) B ![link](media/linked.png) C ![side](media/../memos/pic.png) D ![ok](media/pic.png)' }]);
    const mediaDir = path.join(dir, 'media', 'memos');
    fs.mkdirSync(mediaDir, { recursive: true });
    fs.writeFileSync(path.join(mediaDir, 'pic.png'), 'PNG');
    // Beside the compiled media, where `..` reaches, and a symlink out of it
    fs.writeFileSync(path.join(dir, 'secret.txt'), 'SECRET');
    fs.symlinkSync(path.join(dir, 'secret.txt'), path.join(mediaDir, 'linked.png'));

    expect(mediaSeeder.seed({ compiledDir: dir, mode: 'replace-on-collision', log: () => {} })).toEqual({ created: 1, updated: 0, skipped: 0 });

    const { id, body } = memo('Escape');
    expect(body).toBe(`A ![up](media/../../secret.txt) B ![link](media/linked.png) C ![side](media/../memos/pic.png) D ![ok](media://${id}/pic.png)`);
    expect(fs.readdirSync(path.join(getMediaPath(), id))).toEqual(['pic.png']);
    // Where the `..` links would have been written
    expect(fs.existsSync(path.join(getMediaPath(), 'memos'))).toBe(false);
    expect(fs.existsSync(path.join(getMediaPath(), '..', 'secret.txt'))).toBe(false);
  });
});
