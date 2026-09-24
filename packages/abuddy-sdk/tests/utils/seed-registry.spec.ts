import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { importCompiledSeeds, type Seeder, type ImportContext } from '../../src/utils/index.ts';
import { startTestRuntime, testPacks } from '../../src/testing/index.ts';

// The registered packs' seeders (a registration's `seeders`): the stand-in's, which the specs fill. The host's
// registry refuses two seeders for one key (host tests/packs/registered-lookups.spec.ts).
startTestRuntime();
const registerSeeders = (packId: string, seeders: Seeder[]) => testPacks.seeders.set(packId, seeders);

const dirs: string[] = [];
afterEach(() => {
  testPacks.seeders.clear();
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
  return { key, seen, apply: (ctx: ImportContext) => { seen.push(ctx.compiledDir); return { created, updated: 0, skipped: 0 }; } };
}

describe('importCompiledSeeds', () => {
  it("keeps each pack's seeders for the same key apart", () => {
    const a = recording('library', 1);
    const b = recording('library', 2);
    registerSeeders('pack-a', [a]);
    registerSeeders('pack-b', [b]);

    const dirA = compiledDir('pack-a');
    expect(importCompiledSeeds({ compiledDir: dirA })).toEqual({ library: { created: 1, updated: 0, skipped: 0 } });
    const dirB = compiledDir('pack-b');
    expect(importCompiledSeeds({ compiledDir: dirB })).toEqual({ library: { created: 2, updated: 0, skipped: 0 } });
    expect(a.seen).toEqual([dirA]);
    expect(b.seen).toEqual([dirB]);
  });

  it("runs only the seeders of the pack a directory's seeds.json names", () => {
    const own = recording('notes', 1);
    const other = recording('memos', 1);
    registerSeeders('pack-a', [own]);
    registerSeeders('pack-b', [other]);

    expect(Object.keys(importCompiledSeeds({ compiledDir: compiledDir('pack-a') }))).toEqual(['notes']);
    expect(other.seen).toEqual([]);
    expect(importCompiledSeeds({ compiledDir: compiledDir('pack-c') })).toEqual({});
  });

  it('refuses a directory that names no pack', () => {
    expect(() => importCompiledSeeds({ compiledDir: compiledDir() })).toThrow("doesn't name the pack that compiled these seeds");
  });
});
