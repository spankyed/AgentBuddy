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
import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT, undiffableReason, type BuildUnit, type StampRecord } from '@abuddy/host/build/packages-built';
import { INTEGRATION_SUITES, suiteInputs } from './chain-steps.ts';
import type { Half } from './spec-cost.ts';
import { UNIT_SUITES, type UnitSuite } from './unit-suites.ts';

/**
 * Beside the package builds' and the chain's stamps, in the same cache directory and the same format, so
 * one `STAMP_VERSION` covers all three.
 */
export const POOL_STAMP_DIR = path.join(REPO_ROOT, 'node_modules', '.cache', 'abuddy-unit-pool');

/**
 * Keyed by directory **and half**, because a suite with two halves has two things to remember.
 *
 * The directory alone is what a suite verified, and that does not depend on which pool process ran it — a
 * suite whose `kind` changes moves pools and the answer is the same. But a suite with an integration config
 * runs twice over one input set, and the two runs are not interchangeable: its fast half can have passed
 * while its expensive half never has. One key for both would let the second be skipped on the first's
 * record, which is the hole that kept the integration half from being pooled at all.
 */
export const poolStampFor = (suite: UnitSuite, half: Half): string =>
  path.join(POOL_STAMP_DIR, `${suite.dir}.${half}.json`);

const projectArgs = (suites: readonly UnitSuite[]): string[] =>
  suites.flatMap((suite) => ['--project', suite.workspace]);

/**
 * The three pools: which half each one runs, which suites belong to it, and how it runs them.
 *
 * A pool is a resolution and a half, not a kind of test. `host` and `pack` split on resolution — Node
 * conditions are per process, so those two cannot share one — and `integration` splits on the half, which is
 * why it needs no third resolution: its suites *are* host suites, and what makes them a pool is that a second
 * config holds their expensive specs. `INTEGRATION_SUITES` derives that membership from those configs, so a
 * package that gains one joins this pool without an edit here.
 *
 * `run` is where they differ. Projects of one root config go to a single vitest with `--project`; a pack suite
 * is its own config resolving the published `dist`, so it can share a run with nothing — not even another pack
 * suite.
 *
 * Here rather than in the command, so a spec can ask which suites a pool covers and under which key. The
 * command runs its `main()` on import, which is the reason this module exists at all.
 */
export const POOLS = {
  host: {
    half: 'fast' as Half,
    suites: () => UNIT_SUITES.filter((suite) => suite.kind === 'host'),
    // with-source supplies the @abuddy/source condition the host suites resolve under
    run: (stale: readonly UnitSuite[]) => [{ suites: stale, command: 'node', args: ['scripts/with-source.mjs', 'npx', 'vitest', 'run', ...projectArgs(stale)] }],
  },
  pack: {
    half: 'fast' as Half,
    suites: () => UNIT_SUITES.filter((suite) => suite.kind === 'pack'),
    run: (stale: readonly UnitSuite[]) => stale.map((suite) => ({ suites: [suite], command: 'npm', args: ['test', '-w', suite.workspace] })),
  },
  integration: {
    half: 'integration' as Half,
    suites: () => INTEGRATION_SUITES,
    // The root integration config declares the condition itself, and carries the worker cap that makes this
    // pool faster at half the cores than at all of them
    run: (stale: readonly UnitSuite[]) => [{ suites: stale, command: 'npx', args: ['vitest', 'run', '--config', 'vitest.integration.config.ts', ...projectArgs(stale)] }],
  },
} as const;

export type Pool = keyof typeof POOLS;

/**
 * Every stamp any pool would write, which is what makes the rest dead.
 *
 * Derived from `POOLS`, so a pool that loses a suite — or a key that changes shape, as it did when the half
 * joined it — leaves files nothing will ever read again. The chain prunes its own stamp directory for the same
 * reason (`pruneStamps`, `scripts/chain.ts`): a cache that only ever grows is one where a name collision with
 * something long gone is a silent pass.
 */
export const livePoolStamps = (): Set<string> => new Set(
  (Object.keys(POOLS) as Pool[]).flatMap((name) => POOLS[name].suites().map((suite) => path.basename(poolStampFor(suite, POOLS[name].half)))),
);

/** Drops the stamps no pool would write. Every pool knows every pool's keys, so any run may do it. */
export function prunePoolStamps(): void {
  if (!fs.existsSync(POOL_STAMP_DIR)) return;
  const live = livePoolStamps();
  for (const file of fs.readdirSync(POOL_STAMP_DIR)) {
    if (file.endsWith('.json') && !live.has(file)) fs.rmSync(path.join(POOL_STAMP_DIR, file));
  }
}

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

/**
 * Why one project is about to run, given what its stamp recorded and what a diff of its inputs would say.
 *
 * A pool exists to run a subset, so every non-empty run makes a claim about which projects moved — and
 * `npm run chain -- --dry` cannot settle it, because it reports on the *step*, a different unit with a
 * different input set. It can say what moved under `test:unit:host` while being unable to say which of the
 * eleven projects inside it that was.
 *
 * Pure, over a record and a thunk, so the answers can be checked without a stamp on disk — and `??`
 * short-circuits, so the diff is never computed for a stamp that may not be diffed. Which stamps those are is
 * `undiffableReason`'s to say, not this line's: a version it does not recognise is the clause an explainer is
 * most likely to forget, and forgetting it here printed a file name beside a reason that said the stamp could
 * not be read at all.
 */
export const whyItRuns = (record: StampRecord | undefined, moved: () => string): string =>
  undiffableReason(record) ?? (moved() || 'its inputs changed');
