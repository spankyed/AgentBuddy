import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { inputFiles, REPO_ROOT } from '@abuddy/host/build/packages-built';
import { suiteInputs } from '../../../scripts/lib/chain-steps.ts';
import { UNIT_SUITES, type UnitSuite } from '../../../scripts/lib/unit-suites.ts';
import { reachableFrom } from '../../../scripts/lib/module-graph.ts';
import { population } from '@abuddy/sdk/testing';

/**
 * A suite declares the files its specs load.
 *
 * `chain-inputs.spec.ts` asks the coverage question — every tracked file is *some* step's input — and that
 * leaves the per-suite one unasked: does this suite declare what this suite reads. Three defects in one
 * week were that gap, each found by accident rather than by a check: `test:smoke` cached stale over the
 * bundle it drives, the repo-wide guards ran against 13% of their subject, and a doc a spec asserts sat in
 * no step's inputs.
 *
 * The consequence is specific and quiet. A suite's project is re-run when *its* declared inputs move
 * (`poolUnitFor`, `scripts/lib/unit-pool.ts`), so a spec that imports a file nobody declared keeps its last
 * result while that file changes. Measured on the two this found: touching
 * `packages/abuddy-ui/src/tailwind-preset.ts` left `@abuddy/cli`'s project not stale, and the spec that
 * imports it did not re-run.
 *
 * **Relative imports only**, which is what `reachableFrom` follows. A bare `@abuddy/…` specifier is covered
 * instead by `workspaceDeps` reading the manifest, so this compares a graph against a declaration *and*
 * another declaration rather than against an observation — worth knowing before trusting it as proof. What
 * it cannot see at all is a path built at runtime: the repo-wide guards ask git what the tree holds, which
 * `SUITE_READS.repo` declares and `fingerprint-scope.spec.ts` holds to the specs that do it.
 */

/** Every spec in a suite, which is where the walk starts. */
function specsOf(suite: UnitSuite): string[] {
  const root = path.join(REPO_ROOT, 'packages', suite.dir, 'tests');
  if (!fs.existsSync(root)) return [];
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.spec.ts')) found.push(full);
    }
  };
  walk(root);
  return found;
}

/**
 * What a suite's specs load, and what that suite says it reads — both as repo-relative paths.
 *
 * Memoised, because both cases below ask it of every suite and the walk is the whole cost of this file:
 * taking it twice measured 2.5s against a 2.5s edge, and the half that would have moved it to is the one
 * declaring no repo-wide tree — so the spec would have gone blind to every package it is here to watch.
 */
const walked = new Map<string, { reached: string[]; declared: Set<string> }>();
function reads(suite: UnitSuite): { reached: string[]; declared: Set<string> } {
  const found = walked.get(suite.dir) ?? {
    reached: reachableFrom(specsOf(suite), [REPO_ROOT]).map((file) => path.relative(REPO_ROOT, file)),
    declared: new Set(suiteInputs(suite).flatMap((input) => inputFiles(path.join(REPO_ROOT, input)))),
  };
  walked.set(suite.dir, found);
  return found;
}

describe('a suite declares what its specs read', () => {
  const suites = (): UnitSuite[] => UNIT_SUITES.filter((suite) => specsOf(suite).length > 0);

  it('finds the suites and their specs, so the rule below is not walking an empty tree', () => {
    const found = population('unit suites with specs', suites(), { atLeast: 10 });
    const reached = found.flatMap((suite) => reads(suite).reached);
    expect(reached.length, 'no spec reaches any file, so every suite would pass trivially').toBeGreaterThan(500);
  });

  /**
   * One direction only. Over-declaration is not a finding here: `suiteInputs` declares whole directories —
   * a package's `src`, its `tests`, its dependencies' source — so most files under them are legitimately
   * never loaded by a spec, and reporting those would bury the one that matters.
   */
  it('leaves no file a spec loads outside the inputs that re-run it', () => {
    const undeclared = suites().flatMap((suite) => {
      const { reached, declared } = reads(suite);
      return reached.filter((file) => !declared.has(file)).map((file) => `${suite.dir} reads ${file}`);
    });
    expect(undeclared, 'a spec loads these and nothing re-runs it when they change. Declare them: a file in '
      + "another package means that package belongs in this one's dependencies, and a file beside the "
      + 'package means a missing entry in WORKSPACE_PARTS').toEqual([]);
  });
});
