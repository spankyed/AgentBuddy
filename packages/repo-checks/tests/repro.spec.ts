// What `npm run check:repro` compares, asserted without building anything — two full builds is not a unit
// test, so the script is split (`scripts/repro.ts` orchestrates, `scripts/lib/repro.ts` decides) precisely so
// the deciding half can be watched failing here.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BUILD_UNITS, REPO_ROOT, type BuildUnit } from '@abuddy/host/build/packages-built';
import { PACK_OUTPUTS } from '../../../scripts/lib/chain-steps.ts';
import { compare, KNOWN_IRREPRODUCIBLE, partition, reproPaths, snapshot } from '../../../scripts/lib/repro.ts';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'repro-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const write = (file: string, content: string): void => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
};

describe('what check:repro compares', () => {
  /**
   * Derived from the two declarations that already say where a build writes, so a sixth package is covered on
   * the day it is added rather than the day someone remembers this file.
   */
  it('is every build unit output and the pack outputs, and nothing invented', () => {
    const paths = reproPaths();
    expect(paths, 'the population is empty, so the check would compare nothing').not.toEqual([]);
    for (const pack of PACK_OUTPUTS) expect(paths).toContain(pack);
    // Every unit's declared outputs, repo-relative, and no path outside the repo
    for (const unit of Object.values(BUILD_UNITS)) {
      for (const out of unit.outputs) expect(paths).toContain(path.relative(REPO_ROOT, out).split(path.sep).join('/'));
    }
    expect(paths.filter((p) => p.startsWith('..'))).toEqual([]);
  });

  /**
   * The emptiness guard, watched failing. A check whose population comes from someone else's declaration can
   * be emptied by a change to that declaration, and the failure mode is silence — it compares nothing and
   * passes. Handing in an empty map is the only way to see the branch taken.
   */
  it('refuses an empty population instead of passing over nothing', () => {
    expect(() => reproPaths({} as Record<string, BuildUnit>, [])).toThrow(/derived no output paths/);
  });
});

describe('the comparison', () => {
  const snap = (files: Record<string, string>, dir = 'out'): ReadonlyMap<string, string> => {
    fs.rmSync(path.join(root, dir), { recursive: true, force: true });
    for (const [file, content] of Object.entries(files)) write(`${dir}/${file}`, content);
    return snapshot([dir], root);
  };

  it('says nothing about two builds that agree', () => {
    const before = snap({ 'a.js': 'x', 'nested/b.js': 'y' });
    const after = snap({ 'a.js': 'x', 'nested/b.js': 'y' });
    expect(before.size, 'nothing was hashed, so agreeing means nothing').toBe(2);
    expect(compare(before, after)).toEqual([]);
  });

  // One case per kind: a rewritten file is the symptom this goal is about, and the other two are how a build
  // that stopped emitting something, or started, would show up instead of being read as "unchanged".
  it('names a file whose bytes moved, one that vanished and one that appeared', () => {
    const before = snap({ 'same.js': 'x', 'moved.js': 'one', 'gone.js': 'z' });
    const after = snap({ 'same.js': 'x', 'moved.js': 'two', 'new.js': 'w' });
    expect(compare(before, after)).toEqual([
      { path: 'out/gone.js', kind: 'disappeared' },
      { path: 'out/moved.js', kind: 'changed' },
      { path: 'out/new.js', kind: 'appeared' },
    ]);
  });

  /** A path that does not exist contributes nothing rather than throwing, so a build that never ran reads as empty */
  it('passes over an output tree that is not there', () => {
    expect(snapshot(['never-built'], root).size).toBe(0);
  });
});

/**
 * The recorded exceptions. Unlike every other exception table here, a stale entry is *reported* rather than
 * failed: all three are races, so a run where one happens to agree says nothing about whether it is fixed,
 * and failing on that would make the check flaky in the direction of a false green.
 *
 * What can still be asserted is that an entry names a path the check actually looks at. An exception for a
 * file outside the derived population is dead text that reads as coverage.
 */
describe('the recorded irreproducible outputs', () => {
  it('each name a path inside the population, so none is dead text', () => {
    const paths = reproPaths();
    const covered = (file: string) => paths.some((p) => file === p || file.startsWith(`${p}/`));
    expect(Object.keys(KNOWN_IRREPRODUCIBLE), 'nothing is recorded, so this passes over nothing').not.toEqual([]);
    expect(Object.keys(KNOWN_IRREPRODUCIBLE).filter((file) => !covered(file)),
      'these are recorded as known-irreproducible but sit outside the trees the check compares, so the entry '
      + 'explains nothing and no run can reach it').toEqual([]);
  });

  it('each carry a reason, since an unexplained exception is just a silenced failure', () => {
    expect(Object.entries(KNOWN_IRREPRODUCIBLE).filter(([, why]) => why.trim().length < 20).map(([file]) => file)).toEqual([]);
  });

  /** The split itself: a recorded path is reported, anything else fails the run */
  it('are reported while an unrecorded difference fails', () => {
    const recorded = Object.keys(KNOWN_IRREPRODUCIBLE)[0]!;
    const { failing, known } = partition([
      { path: recorded, kind: 'changed' },
      { path: 'packages/abuddy-sdk/dist/index.js', kind: 'changed' },
    ]);
    expect(known.map((d) => d.path)).toEqual([recorded]);
    expect(failing.map((d) => d.path)).toEqual(['packages/abuddy-sdk/dist/index.js']);
  });
});

/**
 * The trap this check would otherwise walk into, and the reason `scripts/repro.ts` runs codegen itself.
 *
 * `abuddy build` calls `generateEntries([])` with no `--force`, and `generate-entries` returns early when
 * `.inputs-hash` matches. So a round that leaves codegen to `abuddy build` re-hashes `src/__generated__`
 * without having regenerated it, and reports it identical — half of `PACK_OUTPUTS` passing for having been
 * looked at rather than checked.
 *
 * Asserted against the script's text because the alternative is running two real builds. It is a weaker check
 * than executing it, and it is the one that is affordable; what it pins is that the flag is not quietly
 * dropped.
 */
describe('the codegen the second build would otherwise skip', () => {
  it('is forced by the script, not left to abuddy build', () => {
    const script = fs.readFileSync(path.join(REPO_ROOT, 'scripts/repro.ts'), 'utf-8');
    const call = /'generate:entries'[^\n]*\n?[^\n]*/.exec(script)?.[0];
    expect(call, 'scripts/repro.ts no longer runs generate:entries at all').toBeDefined();
    expect(call, "generate:entries runs without --force, so the second build reuses src/__generated__ and the "
      + 'check compares codegen output it never regenerated').toContain('--force');
  });
});
