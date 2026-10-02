import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { CHAIN_STEPS } from '../../../scripts/lib/chain-steps.ts';
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
