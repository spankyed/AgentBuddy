// The generic seeder's change tracking at its edges: a row whose seeded values weren't recorded, rows two
// packs' records both identify, and an update hook that fails part way.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dropAttribute, resetTestData, startTestRuntime } from '../../src/testing/index.ts';
import { createSeeder } from '../../src/seed/seeder.ts';
import { seedHookRegistry } from '../../src/seed/hooks.ts';
import { findWhere } from '../../src/ears/query-helpers.ts';
import { getMediaPath } from '../../src/utils/index.ts';
import { createEntityWithDefaults, updateEntity } from '../../src/ears/transaction-helpers.ts';
import type { SeedRecord } from '../../src/build/seeds/records.ts';
import type { EARS } from '../../src/types/entities.ts';

type Memo = { id: EARS.EntityId; name: string; body: string; pinned?: boolean; mood?: string; sourceHash?: string; seededFields?: { fields: string[] } };
const memos = (name: string) => findWhere<Memo>('Memo' as EARS.Entity, 'name', name);
const memo = (name: string) => memos(name)[0];
const edit = (name: string, fields: Partial<Memo>) => updateEntity(memo(name).id, fields);

const dirs: string[] = [];
let dataDir: string;
beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seeder-data-'));
  process.env.ABUDDY_ENV ??= 'test';
  process.env.ABUDDY_USER_DATA_DIR ??= dataDir;
  startTestRuntime({ entityTypes: ['Memo'] });
});
beforeEach(() => resetTestData());
afterEach(() => seedHookRegistry.unregisterAll('memo-hooks'));
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

const seeder = createSeeder({ key: 'memos', identity: ['name'] });
const seed = (dir: string) => seeder.seed({ compiledDir: dir, mode: 'replace-on-collision', log: () => {} });

describe('a row whose seeded values were not recorded', () => {
  it("is left alone when its record changes: it can't be checked for edits", () => {
    seed(compiled('pack-a', [{ name: 'Intro', body: 'Hello' }]));
    dropAttribute(memo('Intro').id, 'seededFields');
    expect(seed(compiled('pack-a', [{ name: 'Intro', body: 'Hello again', version: 'v2' }]))).toEqual({ created: 0, updated: 0, skipped: 1 });
    expect(memo('Intro').body).toBe('Hello');
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

describe('an update hook that fails part way', () => {
  it("reports the error and leaves the row updatable, not edited: the next seed updates it", () => {
    let failing = true;
    seedHookRegistry.register('Memo', {
      create: (record) => createEntityWithDefaults('Memo' as EARS.Entity, { name: record.name, body: record.body, pinned: false }).id,
      update: (id, record) => {
        updateEntity(id, { body: record.body });
        if (failing) throw new Error('disk full');
        updateEntity(id, { pinned: record.pinned });
      },
    }, 'memo-hooks');
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
    seedHookRegistry.register('Memo', {
      update: (id, record) => {
        updateEntity(id, { body: record.body });
        throw new Error('disk full');
      },
    }, 'memo-hooks');
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
    seedHookRegistry.register('Memo', {
      update: (id, record, { clearedFields }) => {
        cleared.push(clearedFields);
        updateEntity(id, { body: record.body, ...(clearedFields.includes('pinned') && { pinned: false }) });
      },
    }, 'memo-hooks');
    seed(compiled('demo', [{ name: 'Intro', body: 'Hello', pinned: true }]));
    seed(compiled('demo', [{ name: 'Intro', body: 'Hello', version: 'v2' }]));
    expect(cleared).toEqual([['pinned']]);
    expect(memo('Intro').pinned).toBe(false);
  });
});

describe('a created row that fails before it is tracked', () => {
  it('is removed and the error reported, so the next seed creates it again and tracks it', () => {
    let failing = true;
    seedHookRegistry.register('Memo', {
      update: (id, record) => {
        if (failing) throw new Error('disk full');
        updateEntity(id, { body: record.body });
      },
    }, 'memo-hooks');
    const mediaSeeder = createSeeder({ key: 'memos', identity: ['name'], media: true });
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
