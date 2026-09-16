import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { registerSeeders, seedData, unregisterSeeders, type Seeder, type SeederContext } from '../../src/utils/index.ts';

const dirs: string[] = [];
afterEach(() => {
  unregisterSeeders('pack-a');
  unregisterSeeders('pack-b');
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A compiled seeds directory whose seeds.json names `packId` */
function compiledDir(packId?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-registry-'));
  dirs.push(dir);
  fs.writeFileSync(path.join(dir, 'seeds.json'), JSON.stringify({ version: 1, ...(packId && { packId }), seeds: [] }));
  return dir;
}

/** A seeder that records which directories it seeded */
function recording(key: string, created: number): Seeder & { seen: string[] } {
  const seen: string[] = [];
  return { key, seen, seed: (ctx: SeederContext) => { seen.push(ctx.compiledDir); return { created, updated: 0, skipped: 0 }; } };
}

describe('seeder registry', () => {
  it("keeps each pack's seeders for the same key apart", () => {
    const a = recording('library', 1);
    const b = recording('library', 2);
    registerSeeders('pack-a', [a]);
    registerSeeders('pack-b', [b]);

    const dirA = compiledDir('pack-a');
    expect(seedData({ compiledDir: dirA })).toEqual({ library: { created: 1, updated: 0, skipped: 0 } });
    const dirB = compiledDir('pack-b');
    expect(seedData({ compiledDir: dirB })).toEqual({ library: { created: 2, updated: 0, skipped: 0 } });
    expect(a.seen).toEqual([dirA]);
    expect(b.seen).toEqual([dirB]);
  });

  it("runs only the seeders of the pack a directory's seeds.json names", () => {
    const own = recording('notes', 1);
    const other = recording('memos', 1);
    registerSeeders('pack-a', [own]);
    registerSeeders('pack-b', [other]);

    expect(Object.keys(seedData({ compiledDir: compiledDir('pack-a') }))).toEqual(['notes']);
    expect(other.seen).toEqual([]);
    expect(seedData({ compiledDir: compiledDir('pack-c') })).toEqual({});
  });

  it("replaces a pack's seeders when it registers again, and drops them when unregistered", () => {
    const first = recording('notes', 1);
    const second = recording('memos', 1);
    registerSeeders('pack-a', [first]);
    registerSeeders('pack-a', [second]);
    const dir = compiledDir('pack-a');
    expect(Object.keys(seedData({ compiledDir: dir }))).toEqual(['memos']);
    expect(first.seen).toEqual([]);

    unregisterSeeders('pack-a');
    expect(seedData({ compiledDir: dir })).toEqual({});
  });

  it('refuses two seeders for one key in a pack, and a directory that names no pack', () => {
    expect(() => registerSeeders('pack-a', [recording('notes', 1), recording('notes', 2)]))
      .toThrow('Pack "pack-a" registers two seeders for seed key "notes"');
    expect(() => seedData({ compiledDir: compiledDir() })).toThrow("doesn't name the pack that compiled these seeds");
  });
});
