/**
 * A unit pool's per-project cache: where a project's stamp lives and what it is a fingerprint of.
 *
 * The definition, not the command — `scripts/test-unit-pool.ts` is the command over it, the same split as
 * `scripts/ensure-packages-built.ts` over `@abuddy/host/build/packages-built`. It is a module of its own for
 * one reason: the guard in `chain-inputs.spec.ts` has to read what the pool actually fingerprints, and the
 * pool script runs its `main()` on import, so a spec cannot ask it.
 *
 * That guard is the point. A pool is the inner half of two caches over one body of work — the chain stamps
 * the step, this stamps each project — and such a pair is only sound while the inner layer's inputs cover
 * the outer's. Both sides derive from `suiteInputs`, so they hold by construction; the guard is what fails
 * when someone gives the step an input this cannot see, which is the defect it was written after.
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
