/**
 * A unit pool's per-project cache: where a project's stamp lives and what it is a fingerprint of.
 *
 * The definition, not the command — `scripts/test-unit-pool.ts` is the command over it, the same split as
 * `scripts/ensure-packages-built.ts` over `@abuddy/host/build/packages-built`. It is a module of its own for
 * one reason: the guard in `chain-inputs.spec.ts` has to read what the pool actually fingerprints, and the
 * pool script runs its `main()` on import, so a spec cannot ask it.
 *
 * Both this and the chain's pool step derive from `suiteInputs`, whose doc carries the rule the pair of
 * caches holds to and what happened when it did not.
 */
import * as path from 'node:path';
import { REPO_ROOT, type BuildUnit } from '@abuddy/host/build/packages-built';
import { suiteInputs } from './chain-steps.ts';
import type { UnitSuite } from './unit-suites.ts';

/**
 * Beside the package builds' and the chain's stamps, in the same cache directory and the same format, so
 * one `STAMP_VERSION` covers all three.
 */
export const POOL_STAMP_DIR = path.join(REPO_ROOT, 'node_modules', '.cache', 'abuddy-unit-pool');

/**
 * Keyed by directory, so a suite has one stamp whichever pool runs it.
 *
 * That used to be a hole rather than a choice: a suite whose `kind` changed moved pools, the destination
 * step went stale through `unit-suites.ts`, and the suite's stamp — being pool-independent — still read
 * fresh, so it ran in neither. It is safe now because `unit-suites.ts` is one of the runner inputs
 * `suiteInputs` carries, so editing it makes every project stale; keeping the key pool-independent is then
 * the right answer, because what a suite verified does not depend on which pool process ran it.
 */
export const poolStampFor = (suite: UnitSuite): string => path.join(POOL_STAMP_DIR, `${suite.dir}.json`);

/** A project as a build unit, so it goes through the same freshness check as everything else */
export const poolUnitFor = (suite: UnitSuite): BuildUnit => ({
  inputs: suiteInputs(suite).map((input) => path.join(REPO_ROOT, input)),
  outputs: [],
});

// eslint-disable-next-line no-control-regex -- vitest colours its output and this reads it back
const ANSI = /\u001B\[[0-9;]*m/g;

/**
 * The projects a vitest run reported, from its own output.
 *
 * vitest labels every file with its project when a run covers more than one — `✓ |@abuddy/ears| tests/x.spec.ts`
 * — which is the only thing that says what a `--project` filter actually selected.
 */
export function projectsThatRan(output: string): Set<string> {
  return new Set([...output.replace(ANSI, '').matchAll(/^\s*[✓×↓]\s*\|([^|]+)\|/gm)].map(([, name]) => name));
}

/**
 * The projects a run was asked for and did not report.
 *
 * **A `--project` filter that matches nothing is silently dropped**, as long as one other filter matched:
 * measured, `--project @abuddy/ears --project @abuddy/no-such-project` runs ears, ignores the second and
 * exits 0 with no warning. Only a filter matching *nothing at all* is an error. So a suite whose workspace
 * stopped matching its vitest project name would be stamped as having passed a run it was excluded from,
 * and would then stay cached — the same "recorded fresh having never run" this pool was already fixed for
 * once, through a different door.
 *
 * Checked rather than adapted to. Stamping only what reported would make the run "correct" while quietly
 * testing less, which is the failure being prevented, just smaller.
 *
 * Only meaningful when a run covers more than one project: with a single project vitest prints no labels,
 * and the process exiting 0 is itself the evidence.
 */
export function projectsThatDidNotRun(asked: readonly string[], output: string): string[] {
  if (asked.length < 2) return [];
  const ran = projectsThatRan(output);
  return asked.filter((project) => !ran.has(project));
}
