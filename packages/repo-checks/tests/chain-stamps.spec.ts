import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { CHAIN_STEPS } from '../../../scripts/lib/chain-steps.ts';
import { stampFor } from '../../../scripts/lib/chain-stamps.ts';
import { population } from '@abuddy/sdk/testing';

/**
 * The stamp store holds a record for each cached step and for nothing else.
 *
 * Two ways that can go wrong, and only one of them is cosmetic.
 *
 * **A stamp for an uncached step is a bug.** A step declaring `neverCachedBecause` must run every time,
 * and `runAndStamp` returns before `stampedRun` for one. If a stamp appears for such a step, that branch
 * has stopped holding and the chain is skipping work it promised always to do — the failure
 * `packages:ensure` is uncached *because of*: it reported `cached` while `packagesBuiltOrRefuse()`
 * refused, and five files of tests were skipped behind it.
 *
 * **A stamp for a step that no longer exists is a record with no subject.** This chain grew one —
 * `typecheck.json` outlived the step when it became eighteen. Harmless by itself, and exactly the shape
 * the rest of this work removes, so `pruneStamps` clears both on every run.
 *
 * Evidence-dependent, like the dep files: a checkout that has never run the chain has no store, and the
 * case below says so rather than passing over an empty directory.
 */
const STAMP_DIR = path.join(REPO_ROOT, 'node_modules', '.cache', 'abuddy-chain');
const stampName = (step: string): string => `${step.replace(/[:/]/g, '-')}.json`;
const stamps = (): string[] => (fs.existsSync(STAMP_DIR)
  ? fs.readdirSync(STAMP_DIR).filter((file) => file.endsWith('.json')).sort()
  : []);

describe('the chain stamps exactly the steps it caches', () => {
  /**
   * No two steps share a record, which the name alone does not promise.
   *
   * `stampFor` flattens `:` and `/` to `-` so the name is a legal filename everywhere, and **27 of the 29
   * step names are rewritten by it**. That transformation is not injective: `a:b`, `a/b` and `a-b` all come
   * out as `a-b`. Two steps landing on one file is not litter — a stamp is what the chain skips on, so the
   * two would mark each other fresh and the chain would report green for a step that never ran.
   *
   * The same invariant the pools hold ("give no two of their projects the same stamp") and the same defect
   * two halves of a suite had when they shared a key. This store was the only one of the three without it.
   */
  it('give no two steps the same stamp, which the flattening does not promise', () => {
    expect(CHAIN_STEPS.length, 'the table emptied, so this passes over nothing').toBeGreaterThan(25);
    const names = CHAIN_STEPS.map((step) => path.basename(stampFor(step.name)));
    const duplicated = names.filter((name, index) => names.indexOf(name) !== index);
    expect([...new Set(duplicated)], 'two steps would write one stamp, so running either would mark the '
      + 'other fresh — rename one so their names differ by more than a separator').toEqual([]);
  });

  /**
   * And the collision is reachable, so the case above is a gate rather than an assertion.
   *
   * Over names rather than the table, because the table is green: these are the three spellings the
   * flattening cannot tell apart, and any two of them as step names would be the defect.
   */
  it('maps names differing only by a separator onto one file', () => {
    const collapsed = new Set(['a:b', 'a/b', 'a-b'].map((name) => path.basename(stampFor(name))));
    expect(collapsed.size, 'the flattening has become injective, so the case above now guards nothing '
      + 'reachable — say so there rather than leaving it reading as a gate').toBe(1);
  });

  it('finds a stamp store, or says there is no evidence rather than passing over none', () => {
    const found = stamps();
    if (found.length === 0) {
      expect.fail('no stamp store at node_modules/.cache/abuddy-chain: run npm run chain once. '
        + 'An empty directory is not a passing run.');
    }
    population('chain stamps', found, { atLeast: 10 });
  });

  it('holds no stamp for a step that declares it is never cached', () => {
    const uncached = CHAIN_STEPS.filter((step) => step.neverCachedBecause !== undefined);
    expect(uncached.map((step) => step.name), 'no step is uncached, so this case watches nothing')
      .not.toEqual([]);
    const present = stamps().filter((file) => uncached.some((step) => stampName(step.name) === file));
    expect(present, 'these steps promise to run every time and a stamp is how the chain skips one')
      .toEqual([]);
  });

  it('holds no stamp for a step that is not in the table', () => {
    const known = new Set(CHAIN_STEPS.map((step) => stampName(step.name)));
    expect(stamps().filter((file) => !known.has(file)), 'a record whose subject has gone; pruneStamps clears these')
      .toEqual([]);
  });
});
