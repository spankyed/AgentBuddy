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
import { diffableStamp, REPO_ROOT, type BuildUnit } from '@abuddy/host/build/packages-built';
import { INTEGRATION_SUITES, suiteInputs } from './chain-steps.ts';
import { CONFIG_BY_HALF, type Half } from './spec-cost.ts';
import { UNIT_SUITES, type UnitSuite } from './unit-suites.ts';

/**
 * Beside the package builds' and the chain's stamps, in the same cache directory and the same format, so one
 * `fingerprintUnit` and one reader cover all three.
 */
export const POOL_STAMP_DIR = path.join(REPO_ROOT, 'node_modules', '.cache', 'abuddy-unit-pool');

/**
 * Keyed by directory **and half**, because a suite with two halves has two things to remember.
 *
 * A suite with an integration config runs twice over one input set, and the two runs are not interchangeable:
 * its fast half can have passed while its expensive half never has. One path for both would let the second be
 * skipped on the first's record, which is the hole that kept the integration half from being pooled at all.
 *
 * **The path is where a record is kept, not what says which record it is.** That is `poolUnitFor`'s command,
 * in the fingerprint — so a stamp read under the wrong key comes out stale rather than fresh, and a suite that
 * moves pools re-runs, because it is now run a different way. The half is in the path as well because a reader
 * of the cache directory has to be able to tell the files apart.
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
    run: (stale: readonly UnitSuite[]) => [{ suites: stale, command: 'npx', args: ['vitest', 'run', '--config', CONFIG_BY_HALF.integration, ...projectArgs(stale)] }],
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

/**
 * A project as a build unit, so it goes through the same freshness check as everything else.
 *
 * **Keyed by pool, and the command is why.** A suite with an expensive half is two units over one input set,
 * and until 2026-10-02 they hashed the same preimage: `poolUnitFor` set no `command`, so the two differed only
 * in the filename their stamp was written under. `unitStaleReason` consults nothing but the fingerprint — by
 * design, since it recomputes its own side — so the only place an identity can live is the preimage, which is
 * what `BuildUnit.command` is for.
 *
 * Pool rather than half, because `host` and `pack` are both the fast half and run differently. The text is what
 * it would take to run *this* suite alone in this pool, taken from the pool's own `run` so that nothing
 * restates how a pool runs: it does not vary with which other suites a given run found stale.
 */
export const poolUnitFor = (suite: UnitSuite, pool: Pool): BuildUnit => ({
  inputs: suiteInputs(suite, POOLS[pool].half).map((input) => path.join(REPO_ROOT, input)),
  outputs: [],
  command: POOLS[pool].run([suite]).map(({ command, args }) => [command, ...args].join(' ')).join(' && '),
});

// eslint-disable-next-line no-control-regex -- vitest colours its output and this reads it back
const ANSI = /\u001B\[[0-9;]*m/g;

/**
 * **A project label has two forms, and which one you get is not this repo's choice.** vitest's
 * `formatProjectName` writes `|name|` only when colour is unsupported, and otherwise the name padded with a
 * space on each side, black on a background colour — so a TTY gets the second, and so does a pipe whose
 * environment sets `FORCE_COLOR`, which is how an agent's shell runs commands.
 *
 * Reading only the piped form is therefore a check that passes when colour is off and fails every
 * multi-project run when it is on: all eleven host projects reported absent, and the pool refused a run in
 * which every one of them had just passed. The piped form was the only one ever looked at, because the
 * fixture it was written against was invented rather than taken from a run.
 */
// eslint-disable-next-line no-control-regex -- the colour is what identifies the label, so it is the anchor
const COLOURED_LABEL = /^(?:\s|\u001B\[[0-9;]*m)*[✓×↓](?:\s|\u001B\[[0-9;]*m)*\u001B\[(?:4[0-7]|10[0-7])m ([^\u001B]+) \u001B\[49m/gm;
const PIPED_LABEL = /^\s*[✓×↓]\s*\|([^|]+)\|/gm;

/**
 * The projects a vitest run reported, from its own output.
 *
 * vitest labels every file with its project when a run covers more than one — `✓ |@abuddy/ears| tests/x.spec.ts`
 * — which is the only thing that says what a `--project` filter actually selected. Both label forms count;
 * the colours are stripped for the piped one and are the anchor for the other.
 */
export function projectsThatRan(output: string): Set<string> {
  const coloured = [...output.matchAll(COLOURED_LABEL)];
  const piped = [...output.replace(ANSI, '').matchAll(PIPED_LABEL)];
  return new Set([...coloured, ...piped].map(([, name]) => name));
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
 * Why one project is about to run, given what its stamp was read as and what a diff of its inputs would say.
 *
 * A pool exists to run a subset, so every non-empty run makes a claim about which projects moved — and
 * `npm run chain -- --dry` cannot settle it, because it reports on the *step*, a different unit with a
 * different input set. It can say what moved under `test:unit:host` while being unable to say which of the
 * eleven projects inside it that was.
 *
 * Pure, over a read and a thunk, so the answers can be checked without a stamp on disk — and `??`
 * short-circuits, so the diff is never computed for a stamp that may not be diffed. It takes the *read* rather
 * than the record because that is what makes the two inseparable: the caller cannot reach the fields a diff
 * needs without having been told whether they are readable, where it used to ask one function and then narrow
 * for itself. Forgetting that printed a file name beside a reason that said the stamp could not be read at all.
 */
export const whyItRuns = (read: ReturnType<typeof diffableStamp>, moved: () => string): string =>
  read.undiffable ?? (moved() || 'its inputs changed');
