import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyRecord, importCompiledContent, type ApplyRecord, type ContentApplier, type ApplyContext } from '../../src/utils/index.ts';
import { startTestRuntime, testPacks } from '../../src/testing/index.ts';

// The registered packs' appliers (a registration's `appliers`): the stand-in's, which the specs fill. The host's
// registry refuses two appliers for one key (host tests/packs/registered-lookups.spec.ts).
startTestRuntime();
const registerAppliers = (packId: string, appliers: ContentApplier[]) => testPacks.appliers.set(packId, appliers);

const dirs: string[] = [];
afterEach(() => {
  testPacks.appliers.clear();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A compiled content directory whose content.json names `packId` */
function compiledDir(packId?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'content-registry-'));
  dirs.push(dir);
  fs.writeFileSync(path.join(dir, 'content.json'), JSON.stringify({ version: 1, ...(packId && { packId }), content: [] }));
  return dir;
}

/** An applier that records which directories it written */
function recording(key: string, created: number): ContentApplier & { seen: string[] } {
  const seen: string[] = [];
  return { key, seen, apply: (ctx: ApplyContext) => { seen.push(ctx.compiledDir); return { created, updated: 0, skipped: 0 }; } };
}

describe('importCompiledContent', () => {
  it("keeps each pack's appliers for the same key apart", () => {
    const a = recording('library', 1);
    const b = recording('library', 2);
    registerAppliers('pack-a', [a]);
    registerAppliers('pack-b', [b]);

    const dirA = compiledDir('pack-a');
    expect(importCompiledContent({ compiledDir: dirA })).toEqual({ library: { created: 1, updated: 0, skipped: 0 } });
    const dirB = compiledDir('pack-b');
    expect(importCompiledContent({ compiledDir: dirB })).toEqual({ library: { created: 2, updated: 0, skipped: 0 } });
    expect(a.seen).toEqual([dirA]);
    expect(b.seen).toEqual([dirB]);
  });

  it("runs only the appliers of the pack a directory's content.json names", () => {
    const own = recording('notes', 1);
    const other = recording('memos', 1);
    registerAppliers('pack-a', [own]);
    registerAppliers('pack-b', [other]);

    expect(Object.keys(importCompiledContent({ compiledDir: compiledDir('pack-a') }))).toEqual(['notes']);
    expect(other.seen).toEqual([]);
    expect(importCompiledContent({ compiledDir: compiledDir('pack-c') })).toEqual({});
  });

  it('refuses a directory that names no pack', () => {
    expect(() => importCompiledContent({ compiledDir: compiledDir() })).toThrow("doesn't name the pack that compiled this content");
  });

  /**
   * **`force` belongs to an import and is out of an apply's reach by construction**, which is the point of
   * checking it here rather than remembering it: an apply hands over what the last one wrote, so a record
   * with anything in `before` *is* an apply, and a run that both converges toward the pack and overwrites
   * the user is the one combination nothing is allowed to be.
   *
   * A restore passes a write-only record, which is also what a pack applying for the first time has — and
   * that case overwrites nothing of anyone's, since there is nothing recorded to overwrite.
   */
  it('refuses to overwrite the user on a run that reads what the last apply wrote', () => {
    const applier = recording('notes', 1);
    registerAppliers('pack-a', [applier]);
    const dir = compiledDir('pack-a');
    const applied: ApplyRecord = applyRecord(new Map([['pack-a:notes/x', { parts: {} }]]));

    expect(() => importCompiledContent({ compiledDir: dir, force: true, applied }))
      .toThrow('force overwrites the user');
    expect(applier.seen, 'and nothing ran').toEqual([]);

    importCompiledContent({ compiledDir: dir, force: true, applied: applyRecord() });
    expect(applier.seen, 'a write-only record is a restore, which is what force is for').toEqual([dir]);
  });
});
