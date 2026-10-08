import * as fs from 'node:fs';
import * as path from 'node:path';
import { BUILD_UNITS, repoRelative, REPO_ROOT } from '@abuddy/host/build/packages-built';
import { PUBLISH_TREE } from '@abuddy/host/build/published-manifest';
import { coresFor } from './core-budget.ts';
import type { TimeoutClass } from './step-timeouts.ts';
import { UNIT_SUITES, type UnitSuite } from './unit-suites.ts';
import { CONFIG_BY_HALF, hasSplit, type Half } from './spec-halves.ts';
import { dependencySource, PACKAGE_DIRS, workspaceDeps } from './workspace-deps.ts';
import { LEG_TIMEOUT, scopeOf, TYPECHECK_LEGS, type Leg } from './typecheck-legs.ts';
import { API_CHECK_TIMEOUT } from './api-report-packages.ts';

/**
 * The pre-merge chain's steps and what each is allowed to read. Separate from `scripts/chain.ts` because
 * that module runs the chain when imported, and `check-test-tiers.ts` needs the table without running it.
 *
 *   1 pure      its own package's source, the in-memory runtime, fakes. No build output, no app.
 *   2 contract  the built @abuddy packages and a pack's build output. Not the app.
 *   3 app       the built app.
 *
 * A step that launches the app without saying so is the coupling this exists to catch: it welds a fast
 * check to a slow one, and the pair can then be neither cached nor reordered. `check:tiers` fails on one.
 * The reasoning and the measurements are in `docs/archive/goals/goal-test-tiers.md`, which calls the
 * declaration a tier; it is derived from the declared inputs now (`needsApp` below), and the three-value
 * version is in `docs/archive/plans/tier-split.md`.
 */


export interface ChainStep {
  /** The npm script, as `npm run <name>` (or `npm test` for the E2E suite) */
  readonly name: string;
  /**
   * What the step reads, repo-relative; a directory is walked. This is its cache key, the same shape
   * `BuildUnit.inputs` has, so one fingerprint protocol covers both. Repo-relative rather than absolute
   * because this table is data that a spec and two scripts import — resolving paths is the consumer's job.
   *
   * Required, not optional, and now doubly so: the edges are derived from it. A step that declares no
   * inputs depends on nothing and is ordered first, which is a wrong answer rather than a missing one.
   * An earlier phase of this table added its ordering fields and left this out, and its "Done when"
   * passed anyway because it asserted the ordering those fields were for.
   */
  readonly inputs: readonly string[];
  /** What it writes, so a later step's `inputs` can name them instead of guessing at the same paths */
  readonly outputs?: readonly string[];
  /**
   * Generated trees inside `inputs` that this step declares the parent of and never reads. Every gitignored
   * input has to be accounted for — `packages/repo-checks/tests/chain-inputs.spec.ts` fails one that is neither a step's
   * output you depend on nor listed here — because an unaccounted one is either an undeclared dependency
   * (a race) or churn that stops the step ever caching. Each entry is a claim that the step reads around
   * the tree, so it belongs with evidence.
   */
  readonly excludes?: readonly string[];
  /**
   * Suffixes inside `inputs` this step does not read — `excludes` by extension rather than by path. The
   * rule, what it is sound over and why it exists is on `BuildUnit.excludeSuffixes`, which carries it.
   */
  readonly excludeSuffixes?: readonly string[];
  /**
   * Paths this step writes that are not products: transient, not cached, and not safe to touch beside it.
   *
   * `outputs` answers "what did this build", and a tool that writes into the tree it is *reading* answers
   * neither that nor `excludes`. `attw --pack` is the case: it packs a tarball inside each published tree,
   * analyses it and removes it, so the path is a real write that no cache should record and no concurrent
   * step should observe. Declaring it as an output would take the tree out of this step's own key — and
   * the tree is exactly what the step checks, so it would cache over a stale one.
   *
   * The scheduler derives a mutex from it (`conflictsOf`): a transient write conflicts with anyone writing
   * *or reading* the same path, where two outputs only conflict with each other. That is the difference
   * between a product, which a reader waits for, and a disturbance, which a reader must not see.
   */
  readonly alsoWrites?: readonly string[];
  /**
   * A step the chain does not cache, and why. Set means uncached; the chain prints this sentence where a
   * cache verdict would go, so it is a reason and not a flag — the one line it replaced was hardcoded about
   * Electron and was wrong about the second step to opt out.
   *
   * Two kinds qualify. One is a pass that is not reproducible (the E2E suite). The other is a step whose
   * *effect* is recorded somewhere the chain's fingerprint cannot see: `packages:ensure` guarantees the
   * built packages are current, and whether they are is recorded in `node_modules/.cache/abuddy-packages-build`
   * — not in this step's inputs, and not in its outputs either, which `fingerprintUnit` excludes from the
   * content hash on purpose. Caching such a step is a second record of one fact, and the two can disagree.
   */
  readonly neverCachedBecause?: string;
  /**
   * Run only when asked for, and why — a step the chain knows about but does not gate on.
   *
   * A gate earns its place by catching regressions. A step that exists to be *driven* — to watch the app
   * while writing a feature, or to let an agent see what it built — is a different tool wearing the same
   * shape, and putting it in the chain taxes every merge for a job it was never doing.
   *
   * It stays declared rather than deleted, because its `inputs` are what tell `chain-inputs` that the tree
   * it reads is covered, and `--<flag>` puts it back. Nothing may `need` one: the default chain would then
   * be missing a dependency, which `chainSteps` refuses.
   */
  readonly optInBecause?: string;
  /**
   * What to pass the step so it ignores a cache of its own, appended by `chain.ts` under `--all`.
   *
   * **A step that keeps its own cache needs this, or `--all` lies about it.** The chain's `--all` overrides
   * the chain's stamps; it says nothing to a step that then consults stamps of its own, so the step runs,
   * skips its work and returns green — which is what the two unit pools did with 2634 tests behind them.
   * There is no other escape hatch: the three stamp stores under `node_modules/.cache` have no clear
   * command, so `--all` is the whole answer and has to be true.
   *
   * It is per step rather than a blanket forward because most steps' commands would reject an argument they
   * do not know, and per step rather than an environment variable because an environment variable is
   * inherited by everything a step spawns. This step's inner cache is the one to override; the same run's
   * nested `packages:ensure` calls are not, and there are 18 of them in a serial chain, each a stat and a
   * return. That is the reason an override never goes in the freshness primitive itself — `unitStaleReason`
   * honouring a global flag would turn those 18 stats into 18 builds behind one lock.
   */
  readonly forceArgs?: readonly string[];
  /**
   * How long it may run before its process group is killed, by the kind of work it is
   * (`TIMEOUT_MS`, `scripts/lib/step-timeouts.ts`).
   *
   * **Declared, and deliberately not derived from `seconds`.** The deadline was `seconds × 4` until
   * 2026-10-03, which made it a function of one box: a machine with a third of the cores runs the same
   * deadline over a step three times slower. A class carries no machine. Thresholding `seconds` into a class
   * would re-couple the two, just coarsely, which is the shortcut `step-timeouts.ts` exists to refuse.
   *
   * It is required, as `Leg.seconds` is, because a step with no class has no bound — and an unbounded step
   * is the hang that `boundedSpawn` was written for.
   */
  readonly timeout: TimeoutClass;
  /**
   * What this step loses on a machine a fraction the size of this one, where it has been measured — the
   * rung's own `stretches` otherwise.
   *
   * **Only for a step that caps its own width.** A rung's figure is measured end to end on a pool that takes
   * the whole box, so a member that holds back workers loses fewer of them and stretches less. Charging it
   * the class figure is pessimism, which is safe in a *ceiling* and noise in a *report*: `declaredShare` is
   * both, so a capped member read past its rung on every run while costing what its row says.
   *
   * **It does not reach the deadline.** `TIMEOUT_MS[timeout].ms` is what `boundedSpawn` is given, untouched,
   * so nothing here re-couples when a step is killed to what it was measured at — the trap `step-timeouts.ts`
   * opens with. This corrects the bound and the report, and leaves the kill alone.
   */
  readonly stretches?: number;
  /**
   * What this step costs **when it does its work**, in seconds, measured under the chain's own default
   * admission. Not what it costs when it is cached: `packages:ensure` returns in 0.3s with nothing
   * stale and takes 14s when it builds, and recording the 0.3 gave a step that builds a budget sized for a
   * step that does not, and a timeout message claiming it "costs 1s healthy".
   *
   * **It bounds nothing.** It did until 2026-10-03, when a kill deadline was `seconds × 4` — and what that
   * made every deadline in the repo was a function of this one machine. The deadline is a declared class
   * now (`timeout` above), so what is left here is a *report*: the weight on the critical path, and the
   * number a run is compared against. A stale value misreports the floor and nothing else, which is the
   * whole of why this field may stay machine-bound (`docs/archive/plans/costs-across-machines.md`).
   *
   * **Declared by hand, not recorded, and that is this field's one design choice.** Three readers use it —
   * `driftedSteps` reports a run that contradicts it, `declaredShare` bounds it against the step's timeout
   * rung, and `criticalPath` sums it to say what the chain waits on — and not one of them gates a merge on
   * it. So none needs the number to be *fresh*, only approximately true of one machine, and every one of
   * them tolerates the half-to-double band. A recorder for it needed a band, a window, a machine field and
   * an idle floor before one reading could be compared with another, and the quantity underneath was never
   * one number: `test:smoke` read 11s, 16s, 20s, 21s and 24s across five runs that all passed that floor,
   * because this is the cost *beside whichever peers the schedule admitted*. **Keep the reading; do not
   * decide with it** — the root guide's rule, and `docs/reference/recorded-artifacts.md` has what deciding
   * with one cost the last time.
   *
   * **To change one:** run `npm run chain -- --all` and read the drift report, which prints the declared
   * value beside the measured one; edit this number to match. That judgement is a person's, because one
   * reading cannot tell a step that grew from a box that was busy — the rows are evidence, not an
   * instruction. Every run reports a step that ran past double this number, which is what keeps the table
   * honest without anyone remembering to check. A step that came in under half is reported only by `--all`
   * at `MEASURED_ON`: a run with steps cached, or a smaller budget, has less contention and makes
   * everything look fast, so that direction says nothing about the table. `driftedSteps` finds both;
   * `driftReport` in chain-output.ts decides which the run can answer for.
   *
   * For a step that keeps a cache of its own — the two pooled steps, which run only their stale projects —
   * it is the cost of the *whole* pool, so that the drift report compares like with like. Those steps
   * needed no rule of their own once the gate was on the
   * run: an incremental pool run lands under half, which is the direction every step is now quiet about.
   *
   * **It is the cost in the chain at `MEASURED_ON`, not the cost alone.** Those differ by about two
   * times for a CPU-bound step — `typecheck` was 29s by itself and 63s sharing the machine — so the number is
   * meaningless without the schedule, and saying only "what this costs when it does its work" is how a
   * measurement taken under one admission policy came to sit in a chain running another for two days. That
   * is why `MEASURED_ON` records the box these were taken on and the chain says so when it differs:
   * the schedule was always implicit in the machine, and nothing named it.
   */
  readonly seconds?: number;
}

/** Every step, by name, for validating the derived edges */
const BY_NAME = new Map<string, ChainStep>();

/**
 * The order to run the steps in, derived from what each step reads and writes. Throws on an unknown
 * dependency or a cycle, before
 * anything runs: a graph that is wrong should not be discovered halfway through a six-minute chain.
 */
/**
 * The steps a run gates on: every step, minus the opt-in ones unless they were asked for.
 *
 * Refuses a graph where something needs an opt-in step, since the default run would then be missing a
 * dependency and the failure would arrive halfway through rather than here.
 */
export function chainSteps(include: readonly string[] = [], all: readonly ChainStep[] = CHAIN_STEPS): readonly ChainStep[] {
  const optIn = new Set(all.filter((s) => s.optInBecause !== undefined).map((s) => s.name));
  const kept = all.filter((s) => !optIn.has(s.name) || include.includes(s.name));
  const present = new Set(kept.map((s) => s.name));
  for (const step of kept) {
    // Against the whole table, not against what was kept: an edge to an opt-in step is the thing to refuse,
    // and deriving within `kept` would simply not find it.
    for (const need of dependsOn(step, all)) {
      if (!present.has(need)) {
        throw new Error(`Chain step ${step.name} depends on ${need}, which is opt-in — nothing may depend on one`);
      }
    }
  }
  return kept;
}

/** `child` is `parent` or sits under it */
const inside = (child: string, parent: string): boolean => child === parent || child.startsWith(`${parent}/`);

/**
 * Whether an output lands somewhere a step actually reads — the one predicate both derivations rest on.
 *
 * An input and an output overlap if either contains the other: a step declaring `tests/packs` reads what
 * another writes at `tests/packs/x/dist`, and a step declaring that `dist` reads what another writes at
 * `tests/packs`. `excludes` is what takes it back: a step that declares a tree and says it reads around a
 * generated subtree does not depend on whoever writes there.
 *
 * Getting this wrong is quiet rather than loud, and it was wrong twice while this was being written — once
 * by ignoring `excludes` and once by dropping a whole input because a descendant was excluded. Both
 * produced a plausible edge set. The question is about the *output*, which is why the exclusion test is on
 * `output` and not on `input`.
 */
const consumes = (step: ChainStep, output: string): boolean =>
  step.inputs.some((input) => inside(output, input) || inside(input, output))
  && !(step.excludes ?? []).some((excluded) => inside(output, excluded));

/**
 * What a step must run after, derived from what the others write.
 *
 * Two questions over the same two fields, and the second is the one an earlier draft of this missed:
 *
 * - **outputs into inputs** is a data edge: this step reads what that one writes, so it runs after it.
 * - **outputs into outputs** is a *mutex*: two steps writing the same path must not overlap, in either
 *   order. `conflictsOf` answers that one.
 *
 * Both replace fields that used to be written by hand, and the hand-written ones reproduced exactly:
 * 12 of 13 `needs` from the first question, the thirteenth and both `exclusive` flags from the second.
 */
/**
 * Memoised per step list, which is a scope rather than a key.
 *
 * The reduction below asks `dependsOn` of each ancestor, and without this each of those recomputes the
 * whole subgraph: measured on a complete DAG, 3ms at 8 steps, 13ms at 10, 110ms at 12, 1111ms at 14 —
 * ten times worse every two steps. Today's chain is 4ms because almost every edge points at one producer,
 * so the pairwise filter has nothing to pair; the shape that bites is a step reading several steps'
 * outputs, which is what adding outputs to more actions produces.
 *
 * Keyed on the array object, not its contents, and that is sound only because nothing mutates one: the
 * table is a `const`, and every caller that passes its own builds a fresh array. A `WeakMap` so a test's
 * throwaway list is collected with it. Mutating a list in place and asking again would read the old
 * answer, which is the one way to break this.
 */
const derivedEdges = new WeakMap<readonly ChainStep[], Map<string, readonly string[]>>();

/**
 * The steps whose edges are being computed right now, per list — because the memo cannot say.
 *
 * `memo.set` happens after the reduction returns, so a step mid-computation has no entry, and the
 * reduction asks `dependsOn` of its ancestors: through a cycle that re-enters a computation already on
 * the stack and recurses until the stack ends. `orderedSteps` has the cycle check that should catch it and
 * never gets the chance, because `planSteps` asks for every step's edges first — so the error for a
 * circular graph was `RangeError: Maximum call stack size exceeded`, and the one case that covered cycles
 * never reached this code (a two-step cycle leaves `direct` with one element, and the pairwise filter
 * short-circuits before `reachable` is called).
 *
 * Removed in a `finally` because this map outlives a throw: it is keyed on the list, which is never
 * cleared, so a name left behind would report a cycle on the next question about the same table.
 */
const inProgress = new WeakMap<readonly ChainStep[], Set<string>>();

export function dependsOn(step: ChainStep, steps: readonly ChainStep[] = CHAIN_STEPS): readonly string[] {
  const memo = derivedEdges.get(steps) ?? new Map<string, readonly string[]>();
  derivedEdges.set(steps, memo);
  const already = memo.get(step.name);
  if (already !== undefined) return already;

  const open = inProgress.get(steps) ?? new Set<string>();
  inProgress.set(steps, open);
  // The same wording `orderedSteps` uses, so a circular graph reads the same whichever door finds it
  if (open.has(step.name)) throw new Error(`Chain steps form a cycle through ${step.name}`);
  open.add(step.name);
  try {
    const direct = steps
      .filter((other) => other.name !== step.name && (other.outputs ?? []).some((output) => consumes(step, output)))
      .map((other) => other.name);
    // Transitively reduced, so the graph reads like the table did: `compile` needs `packages:ensure` and
    // everything after it needs `compile`, rather than every step naming every ancestor.
    const reachable = (name: string, seen = new Set<string>()): Set<string> => {
      const other = steps.find((candidate) => candidate.name === name);
      for (const next of other ? dependsOn(other, steps) : []) {
        if (!seen.has(next)) { seen.add(next); reachable(next, seen); }
      }
      return seen;
    };
    const edges = direct.filter((name) => !direct.some((other) => other !== name && reachable(other).has(name))).sort();
    memo.set(step.name, edges);
    return edges;
  } finally {
    open.delete(step.name);
  }
}

/**
 * The steps this one may not run beside, because they write where it writes.
 *
 * This is what `exclusive` stood in for, and it stood in badly: that flag was a *global* mutex, so a step
 * holding it blocked every other step rather than the ones it conflicts with. Both of its users had a real
 * conflict neither declared — one through an output it did not list at all, the other as a proxy for
 * "nothing may build the packages concurrently", which the data edges already enforce.
 *
 * A mutex has no direction. Which of two conflicting steps runs first is a scheduling preference, and
 * lives with the scheduler rather than here.
 */
export function conflictsOf(step: ChainStep, steps: readonly ChainStep[] = CHAIN_STEPS): readonly string[] {
  const overlaps = (a: readonly string[], b: readonly string[]): boolean =>
    a.some((one) => b.some((two) => inside(one, two) || inside(two, one)));
  const writes = (candidate: ChainStep): readonly string[] => [...(candidate.outputs ?? []), ...(candidate.alsoWrites ?? [])];
  const disturbs = (candidate: ChainStep): readonly string[] => candidate.alsoWrites ?? [];
  return steps
    .filter((other) => other.name !== step.name && (
      // Two writers of one path, in either order
      overlaps(writes(step), writes(other))
      // Or one of them writes transiently where the other reads, which a reader must not observe
      || overlaps(disturbs(step), other.inputs)
      || overlaps(disturbs(other), step.inputs)))
    .map((other) => other.name)
    .sort();
}

/** A step with its edges worked out: what it waits for, and what it may not run beside. */
export interface PlannedStep extends ChainStep {
  readonly dependsOn: readonly string[];
  readonly conflicts: readonly string[];
  /**
   * What of the machine it takes (`coresFor`, `core-budget.ts`), for a run admitting on cores.
   *
   * Attached here with the edges, and for the same reason: it is derived from a declaration elsewhere, so
   * carrying it on the table would be a second record to disagree with that one.
   */
  readonly cores: number;
}

/**
 * Every step with its graph attached, which is the only form the scheduler sees.
 *
 * The edges are derived here rather than carried on the table, so there is no second record to disagree
 * with `inputs` and `outputs` — which is what `needs` and `exclusive` were, and what `chain-inputs` had a
 * case policing.
 */
export const planSteps = (steps: readonly ChainStep[] = CHAIN_STEPS): readonly PlannedStep[] =>
  steps.map((step) => ({ ...step, dependsOn: dependsOn(step, steps), conflicts: conflictsOf(step, steps), cores: coresFor(step.name) }));

export function orderedSteps(given: readonly ChainStep[] = CHAIN_STEPS): readonly PlannedStep[] {
  const steps = planSteps(given);
  BY_NAME.clear();
  for (const step of steps) {
    if (BY_NAME.has(step.name)) throw new Error(`Two chain steps named ${step.name}`);
    BY_NAME.set(step.name, step);
  }
  for (const step of steps) {
    for (const need of step.dependsOn) {
      if (!BY_NAME.has(need)) throw new Error(`Chain step ${step.name} depends on ${need}, which is not a step`);
    }
  }
  const order: PlannedStep[] = [];
  const done = new Set<string>();
  const onPath = new Set<string>();
  const visit = (step: PlannedStep): void => {
    if (done.has(step.name)) return;
    if (onPath.has(step.name)) throw new Error(`Chain steps form a cycle through ${step.name}`);
    onPath.add(step.name);
    for (const need of step.dependsOn) visit(BY_NAME.get(need) as PlannedStep);
    onPath.delete(step.name);
    done.add(step.name);
    order.push(step);
  };
  for (const step of steps) visit(step);
  return order;
}

/**
 * In dependency order. `compile` stays ahead of `build` and is not redundant with it: `build -ws` gives no
 * ordering guarantee, since no workspace declares a dependency on `@app/default-setup`, and the renderer's
 * build reads the generated pack entry that `compile` writes.
 *
 * `test:external-pack` is split: its contract half runs here, before `build`, because validating,
 * building and typechecking a pack and running its harness specs needs no app — proved by running it with
 * `packages/renderer/dist` moved aside. Its Playwright half needs the app.
 *
 * `test:packaged-authoring` needs the app whole. It is a linear scenario rather than two halves: step 8
 * needs the archive step 6 produced and step 9 reads the data step 8's app seeded, so it takes a mode rather
 * than a split (Phase 2 of the goal).
 */
/**
 * The one file every step really does read: the installed toolchain, because a dependency moving changes
 * what any of them do.
 *
 * **`package.json` is not here any more**, and that is the point. It was, because a step's command lives
 * in it and a fingerprint hashes paths and bytes — so the only way to key on the command was to hash the
 * whole manifest into all 29 steps. Measured over ~587 commits, 37 touched it and every one of those 37
 * was scripts-only: 37 full chains for an edit to one script. A unit carries its `command` now
 * (`commandText`, `scripts/lib/npm-scripts.ts`), so the manifest's other job here is covered precisely.
 *
 * Its remaining job needs no declaration at all: `workspaces` decides what a workspace is, so adding one
 * changes `EVERY_WORKSPACE`, which changes the declared path list, which `fingerprintUnit` hashes. And
 * each workspace's own manifest is already an input through `WORKSPACE_PARTS`.
 */
const ROOT = ['package-lock.json'];

/**
 * The root vitest config a run of one half uses — which projects it pools is an input to every suite in it.
 *
 * `CONFIG_BY_HALF` is the one record of which file runs which half, and it is the one `hasSplit` and so
 * `INTEGRATION_SUITES` already derive from. The same two names stood here as a `Record<Half, string>` of
 * their own until 2026-10-02 — a second copy one line from a use of its own derivative. The names are a
 * convention rather than a computation, and they are the same convention at both levels: the root config
 * lists the packages' as its projects.
 *
 * Both were declared for every suite until 2026-10-02, which cost two things: an edit to the integration
 * config re-ran all thirteen fast projects, and the two halves of one suite hashed an identical declared set,
 * leaving the stamp's filename as the only thing that told them apart.
 *
 * A pack suite's fast half reads neither. `npm test -w <workspace>` runs that package's own config, which
 * `suiteWorkspace` already declares; the integration half reads this one whatever the suite's kind, because
 * the pool passes `--config` itself.
 *
 * Separate from `ROOT` because only the pools read them. They stay inside `EVERY_SOURCE` as well, since a
 * step that walks the tree — the lint, the import rules — walks these too, and the coverage guard in
 * `chain-inputs.spec.ts` is what would notice if they did not.
 */
const rootConfigFor = (suite: UnitSuite, half: Half): string[] =>
  (half === 'fast' && suite.kind === 'pack' ? [] : [CONFIG_BY_HALF[half]]);

/**
 * Every workspace, from the one definition that decides which they are (`workspace-deps.ts`, read from the
 * root `workspaces` field). This used to walk `packages/` itself and call that "derived" — true of a new
 * directory, false of a new workspace, and these names feed `EVERY_WORKSPACE` and so every step's inputs.
 */
const PACKAGES = PACKAGE_DIRS;

/**
 * A package's own source, its tests, its own tooling, its recorded artifacts, and the files that say how it
 * compiles, tests and lints. `etc` is there because a spec reads it back — `api:check` regenerates the
 * `*.api.md` reports it holds and compares, so a hand-edited report has to re-run what asserts on it. It
 * was justified by `suite-split.spec.ts` reading `etc/spec-cost.json` until 2026-10-05; that record and that
 * spec are gone, and several `etc` directories are now empty, which the walk skips. The config files are inputs in the plain sense — a vitest config decides which specs run at all,
 * and the renderer's tailwind and postcss configs decide what `build` emits. A name that the package does
 * not have costs nothing: the walk skips what is not there.
 *
 * Not the package directory itself, which would pull `dist` into the fingerprint and miss the cache on
 * every build.
 */
/**
 * Exported so a check can tell a path that is *offered* to every workspace from one someone wrote out by
 * hand: for these, absent is the ordinary case and the walk skips it, where a hand-written input that names
 * nothing is a step keyed on a file that does not exist (`chain-inputs.spec.ts`).
 */
export const WORKSPACE_PARTS = [
  // `templates` is the CLI's scaffold: pack code the specifier rules read and the CLI's own suite renders,
  // so a change to one has to invalidate the steps that read the workspace
  'src', 'tests', 'scripts', 'etc', 'templates', 'index.js',
  // `bench` is in `@abuddy/ears`' tsconfig `include`, so its typecheck compiles the benchmark and has to
  // re-run when it moves. Only that workspace has one; the dep-file gate is what noticed
  'bench',
  // A pack's manifest, which `default-setup`'s specs import directly. Eleven workspaces have none
  // and the walk skips what is not there, so for those this adds a path and no bytes
  'abuddy.json',
  'package.json', 'tsconfig.json', 'tsconfig.package.json',
  // The two vitest configs from `CONFIG_BY_HALF`, which is where that naming is declared
  ...Object.values(CONFIG_BY_HALF), 'vite.config.ts', 'vite.config.js',
  'eslint.config.ts', 'postcss.config.cjs', 'tailwind.config.ts', 'tsdown.config.ts', 'env.d.ts',
];
const workspace = (pkg: string): string[] => WORKSPACE_PARTS.map((part) => `packages/${pkg}/${part}`);

/**
 * What a *suite* reads, which is the workspace plus its guide. A fingerprint skips prose (see `READS_MARKDOWN`
 * in `packages-built.ts`), so for all but one package this adds a path and no bytes — and that one is
 * `packages/repo-checks/CLAUDE.md`, whose "What is here" table `spec-plan.spec.ts` asserts. Here and not in
 * `WORKSPACE_PARTS`, so `typecheck`, which compiles the repo and reads no guide, does not take it on.
 */
const suiteWorkspace = (pkg: string): string[] => [...workspace(pkg), `packages/${pkg}/CLAUDE.md`];

/** Every workspace: what `typecheck` reads, since it compiles the repo rather than a package */
const EVERY_WORKSPACE = PACKAGES.flatMap(workspace);

/**
 * Every source tree in the repo: what a check reads when its subject is the repo rather than a package.
 *
 * `typecheck` is one, since it compiles the whole thing. The others are the repo-wide *guards* — a spec
 * that asks `git ls-files` what exists and then asserts something about all of it. Those live inside one
 * package's suite while their subject is everything, and the pool runs a project only when that project's
 * own inputs moved, so each was blind to the rest of the tree: measured 2026-09-30, `@abuddy/sdk`'s suite
 * was an input to 241 of 1860 tracked code files and `@app/repo-checks`' to 308. `identity-guard` then
 * missed a forbidden path committed to `@abuddy/cli` and two full chain runs passed over it.
 *
 * Build output is not in here, because a guard's subject is source. `typecheck` adds its own.
 */
const EVERY_SOURCE = [...ROOT, ...Object.values(CONFIG_BY_HALF), ...EVERY_WORKSPACE, 'scripts', 'tests/e2e', 'tests/packs', 'tests/scripts',
  'tests/tsconfig.json', 'playwright.config.ts', 'types', 'electron-builder.mjs',
  // The drive layer's tracked files, and only them: the two configs and the serving session. The driving
  // scripts beside them are gitignored and ad-hoc, so naming the directory would re-run a typecheck every
  // time someone poked at the app
  'drive/playwright.config.ts', 'drive/engine.config.mts', 'drive/engine-session.mts',
  'build/prod/diagnostics.mjs', 'build/prod/verify-node-modules.mjs',
  'packages/abuddy-cli/bin/abuddy.mjs', 'packages/abuddy-cli/bin/source-hooks.mjs',
  'packages/abuddy-ears/bench/ears.bench.ts', 'packages/api/tsup.config.ts',
  'packages/dev-mode.js', 'packages/entry-point.mjs'];

/**
 * `packages:ensure` builds the publishable packages, so its inputs are theirs — taken from `BUILD_UNITS`
 * rather than copied beside it. A copy of someone else's input list is the thing that goes stale silently:
 * a file added to a build unit would leave this step cached against a key that never saw it.
 */
// Through `repoRelative`, because these land in `step.outputs` beside hand-written POSIX literals and
// `writerOf` compares the two
const relative = repoRelative;
const PACKAGE_BUILD_INPUTS = [...new Set(Object.values(BUILD_UNITS).flatMap((unit) => unit.inputs.map(relative)))].sort();
const PACKAGE_BUILD_OUTPUTS = [...new Set(Object.values(BUILD_UNITS).flatMap((unit) => unit.outputs.map(relative)))].sort();

/**
 * What a *consumer* of the built packages reads: the outputs less the staged publish trees.
 *
 * `publish/` is a copy of what `files` names plus a derived manifest (`stagePublishTree`), written so a
 * tarball ships no `src/` — and **only `packages:check` opens one**, running `publint --strict` and `attw`
 * over each of the three staged trees by name. Nothing resolves *through* a staged tree: a
 * published source branch is a resolution failure rather than a fallback, which is why the tree exists.
 *
 * Every consuming step declared the whole constant until 2026-10-05, which put 610 files into 26 keys that
 * could not change any of their answers — 16470 declared file-slots of the chain's 59073. It cost two
 * things: the walk and the hash carried them, and an edit to a package's `files` or `exports` map rewrote
 * the derived `publish/package.json` and so invalidated 26 steps over the shape of a tarball, including
 * steps that declare nothing else of that workspace. Dropping them moved no ordering edge and no mutex,
 * probed per step against `dependsOn` and `conflictsOf`: the edge to `packages:ensure` runs through the
 * `dist` trees, which every one of them does read.
 *
 * `chain-inputs.spec.ts` holds the rule, so a new step spreading the wrong constant is a failure rather
 * than a key nobody looks at. The narrowing stops here deliberately — `dep-files.ts` records why the same
 * move over a package's `dist` is a judgement this one is not.
 */
const PACKAGE_BUILD_READS = PACKAGE_BUILD_OUTPUTS.filter((out) => !out.endsWith(`/${PUBLISH_TREE}`));

/** What `build` writes: the app that `needsApp` steps read */
export const APP_OUTPUTS = ['packages/renderer/dist', 'packages/api/dist', 'packages/main/dist', 'packages/preload/dist'];

/**
 * Whether a step reads the built app — derived from what it declares, never written beside it.
 *
 * It was a field until 2026-10-02, on the recorded grounds that deriving it would let a step that gains an
 * app dependency be "silently reclassified instead of refused". That argument does not hold, and the reason
 * is worth keeping: **the expensive consequence is already derived from the same inputs.** A step declaring
 * `APP_OUTPUTS` runs after `build:app` because `dependsOn` reads outputs against inputs, whatever any field
 * says — so the field could not be the thing that made an app dependency deliberate. What it did was carry a
 * second copy of that fact, which `check:tiers` then spent two of its three clauses keeping equal.
 *
 * Undo this and you are back to a record that can disagree with the graph. What it does *not* replace is the
 * script scan in `check-test-tiers.ts`: a step can launch the app while declaring none of its outputs, which
 * no reading of the inputs can see, and that is the clause that catches it.
 */
export const needsApp = (step: Pick<ChainStep, 'inputs'>): boolean =>
  step.inputs.some((input) => APP_OUTPUTS.includes(input));
/** The Electron entry and the dev-mode switch: not inside a package, and read by anything that starts the app */
const APP_ENTRY = ['packages/entry-point.mjs', 'packages/dev-mode.js'];
/** The wrapper a shell-script step runs through, and the module that bounds it */
const BOUNDED_RUNNER = ['scripts/bounded.ts', 'scripts/lib/bounded-spawn.ts'];

/**
 * What *runs* the app's builds, as against what those builds read.
 *
 * `build:app` was `npm run build -w a -w b …`, which npm runs serially; it is a scheduler over the same
 * four commands now, and these decide which workspaces are built and how. A pass recorded before the leg
 * table changed is not evidence about the pass after it — drop a leg and the step would otherwise stay
 * fresh while producing one `dist` fewer.
 *
 * `scripts/lib/measure.ts` is here for `--cores`'s parser alone, which is the shape `SUITE_RUNNER` has
 * too: a module that decides *how much of the machine* the step takes is part of what the step does.
 * `chain-inputs.spec.ts` derives this closure and fails anything in it left undeclared.
 *
 * `bounded-spawn.ts` alone and not `BOUNDED_RUNNER`: this step spawns through the module, not through the
 * `scripts/bounded.ts` wrapper a shell-script step runs under, and declaring the wrapper would re-run four
 * builds for an edit that cannot reach them.
 */
const APP_RUNNER = ['scripts/build-app.ts', 'scripts/lib/app-build-legs.ts', 'scripts/lib/bounded-spawn.ts',
  'scripts/lib/chain-schedule.ts', 'scripts/lib/exit-on-epipe.ts', 'scripts/lib/measure.ts'];

/**
 * What *runs* a unit suite, as against what the suite reads — and an input to every project all the same.
 *
 * These decide what runs and how: the runner picks which projects a pool runs, `unit-suites.ts` says which
 * pool a suite is even in, `with-source.mjs` supplies the `@abuddy/source` condition the host suites
 * resolve under, the bounded runner bounds the spawn, and `spec-durations.ts` and `spec-halves.ts` decide
 * what the run then *accepts* — a `@slow:` marker that is no longer true fails the step, so they are as
 * much a part of the verdict as the runner is. A pass recorded before one of them changed is not evidence
 * about the pass after it, so a project whose runner moved is stale.
 *
 * **They used to be declared on the pool step and on no project, which is the defect this fixes.** The step
 * went stale, ran, asked each project and found them all fresh, printed "all N project(s) up to date" and
 * stamped green having tested nothing — and the five files it could not notice changing were the five that
 * decide whether the suites run correctly at all. Changing a suite's `kind` was the worst of them: the
 * destination pool's step went stale, the suite's stamp was keyed by directory rather than by pool, and it
 * ran in neither.
 */
const SUITE_RUNNER = ['scripts/test-unit-pool.ts', 'scripts/lib/unit-pool.ts', 'scripts/lib/unit-suites.ts',
  'scripts/lib/exit-on-epipe.ts', 'scripts/with-source.mjs', 'scripts/lib/spec-durations.ts',
  'scripts/lib/spec-durations-reporter.ts',
  'scripts/lib/spec-halves.ts', ...BOUNDED_RUNNER];
/**
 * What `compile` writes. `src/__generated__` is under the `src` it also reads, so it has to be declared:
 * `fingerprintUnit` excludes a unit's own output from its own fingerprint, and that is what stops the step
 * invalidating itself the first time codegen stops being byte-identical.
 */
export const PACK_OUTPUTS = ['packages/default-setup/dist', 'packages/default-setup/src/__generated__'];

/**
 * The built-in pack's own sources, which **two steps compile**: `compile`, which is the pack's build, and
 * `build:app`, because the app is built from them too. That second reader is the surprising one and the reason
 * this is named rather than spelled twice — the renderer's `builtInPacksPlugin` generates a module of static
 * imports of the pack's generated FE entry, so Vite follows them into each feature's `fe` directory and the pack's
 * components land in the renderer bundle, while the api's tsup traces its generated BE entry the same way.
 *
 * `src` whole rather than a frontend subset, for two independent reasons: a bundler's graph crosses `be`/`fe`
 * freely (`fe/contract.ts` imports `be/types.ts`), and `renderer/tailwind.config.ts` adds
 * `<srcDir>/**` to Tailwind's `content`, so the emitted CSS depends on class-name text in files no bundler
 * traces at all. `abuddy.json` because the discovery parses it and its `id` is the alias prefix;
 * `package.json` because Vite resolves the pack's `#generated/*` and `#features/*` specifiers through its
 * `imports` map. Not `etc` or `tests`, which no build reads, and not `workspace('default-setup')`, which would
 * make a pack test edit cost an app build.
 *
 * **Hand-written, and not derived from a scan of the packs** as `FIXTURE_OUTPUTS` below is derived
 * from the fixtures: `chain-inputs.spec.ts` derives its population from exactly that function, and a check
 * whose two sides come from one source cannot fail. The asymmetry is what makes a second built-in pack fail
 * that case rather than silently satisfy it.
 */
const PACK_SOURCES = ['packages/default-setup/src', 'packages/default-setup/abuddy.json',
  'packages/default-setup/package.json'];

/**
 * What a step reads to derive something from the pack's sources, which `compile` and `facade:check` both do:
 * those sources, the tsconfig the declaration bundler compiles them with, the committed facade report, and
 * the `@abuddy/cli` bundle that does the deriving.
 *
 * Named once because the two lists are identical and nothing would notice them drifting apart — the failure
 * `packages:ensure`' inputs are derived to avoid, a few hundred lines up. The two steps differ in what they
 * *write*, not in what they read: `compile` declares `PACK_OUTPUTS`, and the check declares nothing.
 */
const PACK_DERIVED_READS = [...ROOT, ...PACK_SOURCES, 'packages/default-setup/tsconfig.json',
  'packages/default-setup/etc', ...PACKAGE_BUILD_READS];

/**
 * What building the fixture packs writes, derived from the fixtures themselves. These sit *inside*
 * `tests/packs`, which the same step declares as an input, for the same reason as above.
 */
const FIXTURE_PACKS = fs.readdirSync(path.join(REPO_ROOT, 'tests', 'packs'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(REPO_ROOT, 'tests', 'packs', entry.name, 'abuddy.json')))
  .map((entry) => entry.name)
  .sort();
const FIXTURE_OUTPUTS = FIXTURE_PACKS.flatMap((name) => [`tests/packs/${name}/dist`, `tests/packs/${name}/src/__generated__`]);

/**
 * What running a fixture pack's own Playwright suite leaves behind. Nothing reads it, and it changes every
 * run, so a step that declares `tests/packs` has to say it reads around this or it can never cache.
 */
const FIXTURE_TEST_OUTPUT = FIXTURE_PACKS.flatMap((name) => [`tests/packs/${name}/tests/results`, `tests/packs/${name}/tests/screenshots`]);

/**
 * The unit suites that read build output, and which. Every other suite resolves workspace source through
 * the `@abuddy/source` condition and needs nothing built, which is what lets it start beside the builds.
 *
 * **This cannot be derived from the spec sources, and a scan of them is not the authority.** `@app/api`'s
 * specs never name the pack's `dist`: they boot the app runtime, and host code resolves the path. Declaring
 * that suite as reading nothing let it run beside `compile` under three lanes, where it failed with
 * "Missing or unreadable settings.seed.json" — after passing serially forever, because `compile` always
 * happened to finish first.
 *
 * Ground truth comes from running each suite with the tree moved aside, which is repeatable:
 *
 *     mv packages/default-setup/dist packages/default-setup/.dist-aside
 *     for w in <the UNIT_SUITES workspaces>; do npm test -w $w; done
 *     mv packages/default-setup/.dist-aside packages/default-setup/dist
 *
 * Measured 2026-09-25: default-setup, @abuddy/cli and @app/api fail without it; the other five pass.
 *
 * `@abuddy/host` is listed anyway, and that is the second thing a scan would get wrong. Its
 * `sdk-bridge-drift.spec.ts` reads `dist/runtime/index.cjs` but *skips* when it is missing, so it passes
 * without the pack and would pass vacuously if it raced `compile`. A check that silently stops checking is
 * worse than one that fails, so its verdict depends on that tree and it declares it.
 */
/**
 * `repo` says the suite holds a guard whose subject is the whole tree, so its inputs are the whole tree.
 * Without it the pool skips the project while the thing it checks moves — see `EVERY_SOURCE`.
 */
export const SUITE_READS: Record<string, { packages?: true; pack?: true; repo?: true }> = {
  // `pretest: ensure-packages-built`, `@abuddy/testing`'s bundle, and its own compiled seeds under `dist/`
  'default-setup': { packages: true, pack: true },
  // `pretest: ensure-packages-built`; it packs and installs the published packages, and `dependency-runtime`
  // builds a fixture pack against default-setup's `dist`
  'abuddy-cli': { packages: true, pack: true },
  // `@abuddy/testing`'s bundle; and `sdk-bridge-drift.spec.ts` reads `dist/runtime/index.cjs` when it is
  // there and skips when it is not, so the tree decides whether that check checks anything
  'abuddy-host': { packages: true, pack: true },
  // Boots the app runtime, which loads the built-in pack: `dist/runtime/index.cjs` and `settings.seed.json`.
  // Named by host code rather than by any spec, which is why it has to be measured rather than scanned.
  api: { pack: true },
  // `pretest: ensure-packages-built`; `published-sdk-peers` reads the built `dist` and skips without it.
  // `repo`: six of its specs ask git what the repo holds — the chain's input coverage, spec placement,
  // the lint's scope, the import rules — so every one of them is about files this package does not own
  'repo-checks': { packages: true, repo: true },
  // `pretest: ensure-packages-built`; it npm-packs the built packages into a consumer and compiles it
  'publish-checks': { packages: true },
};

/**
 * Each pool's whole-pool cost, in the chain at `MEASURED_ON`, measured with every project stale —
 * `npm run chain --all`, the only run that does all of that work and the run `driftedSteps` checks it on.
 *
 * Re-measured 2026-09-27 with the rest of this table: 20 and 21 were taken before `typecheck` stopped
 * running its legs one at a time, and a step that asks for half the cores makes everything beside it
 * slower — which is where those seconds went rather than being new work.
 *
 * It bounds nothing — the chain step and the pool's own inner spawn both take the `suite` class now
 * (`step-timeouts.ts`), so neither deadline is a function of this number. What it still has to be is the
 * cost of the whole pool and never of a partial run, so that the drift report compares like with like.
 *
 * **Correcting one of these is an edit here**, like every other declared cost: the drift report prints what
 * the pool measured beside what this says, and one key moves at a time. A run that measured the machine
 * rather than the code is the reason that is a judgement rather than a rewrite — `driftedSteps` reports both
 * directions and neither is self-evidently the code's.
 */
export const POOL_SECONDS: Record<'host' | 'pack' | 'integration', number> = { host: 34, pack: 19, integration: 60 };

/**
 * The files a chain step is declared in — the two tables, as one list, repo-relative.
 *
 * Two readers need it and had their own copies: `declaredIn` (`scripts/chain.ts`), which points a run at the
 * reasoning behind a never-cached step, knew only this file and so could not locate the seventeen typecheck
 * legs or the generated pool steps. One question with two answers, and the one that was wrong was the one
 * nothing checked — `chain-graph.spec.ts` holds every step to being locatable through this list.
 */
export const STEP_TABLES = ['scripts/lib/chain-steps.ts', 'scripts/lib/typecheck-legs.ts'];

/**
 * What one unit suite's last pass depended on: its own workspace, its dependencies' source, whatever build
 * output it touches, and what ran it.
 *
 * **One definition for both cache layers, which is the invariant.** The chain step below declares the union
 * of this across a pool, and `scripts/lib/unit-pool.ts` fingerprints it per project so a pool runs only the
 * stale ones. Two layers over one body of work are only sound when the inner layer's inputs cover the
 * outer's: anything the outer treats as a reason to run has to be a reason for some inner unit to run, or
 * the step runs, skips everything and stamps green. Deriving both from here is what makes that hold by
 * construction rather than by anyone remembering; `chain-inputs.spec.ts` checks the step against what the
 * pool actually fingerprints, so re-adding a step-only input fails by name.
 *
 * **The union is wide, and measured, that costs almost nothing — which is the whole point of the pair.**
 * Over the 200 commits to 2026-10-02 (by prefix match against each declared path, with the files a
 * fingerprint skips removed): `test:unit:host` was stale in 154 of them, and when it ran **3.2 of its 11
 * projects** ran; `test:integration` 154, and 1.7 of 3. So a step declaring 365 paths pays its own startup
 * and hands the rest to the inner cache. 288 of those 365 were never a reason to run at all — `dist` and
 * `publish` trees, `bin/`, `env.d.ts`, `eslint.config.ts` — the same breadth the typecheck legs' 0-21% is
 * mostly made of (`scripts/lib/dep-files.ts`).
 *
 * **The one project that never benefits is `repo-checks`**, stale in 154 of 154 — it declares `EVERY_SOURCE`
 * below, because six of its specs ask git what the repo holds, and that is a rule rather than an oversight
 * (`fingerprint-scope.spec.ts`: a suite holding a guard over the whole repo declares the whole repo).
 * Splitting those six out so the other seventeen cache separately was costed and declined: they are specs
 * about this repo's tooling, so they are stale whenever `scripts/` moves — 97 of the same 200 commits — and
 * would re-run anyway. Worth revisiting if that suite's cost grows or its repo-wide specs stop dominating
 * it. The sample is this branch's own work, so `scripts/` and `repo-checks/tests` lead it by construction;
 * re-take it over a stretch of feature work before reading the per-project ranking as general.
 */
export function suiteInputs(suite: UnitSuite, half: Half): string[] {
  const reads = SUITE_READS[suite.dir] ?? {};
  return [
    ...ROOT,
    // A suite's half runs under one root config, so which projects that config pools is an input to it
    ...rootConfigFor(suite, half),
    ...SUITE_RUNNER,
    ...suiteWorkspace(suite.dir),
    ...workspaceDeps(suite.dir).flatMap(dependencySource),
    ...(reads.packages ? PACKAGE_BUILD_READS : []),
    ...(reads.pack ? PACK_OUTPUTS : []),
    ...(reads.repo ? EVERY_SOURCE : []),
  ];
}

/**
 * The suites with an expensive half, derived from which configs each package has rather than listed here.
 *
 * One step runs all of them (`npm run test:integration`), so the set has to be the same in two places: the
 * step's inputs, and the root script's `-w` flags. A package that gains an integration config is covered
 * by the first automatically, and `chain-inputs.spec.ts` fails the second until it names the package too —
 * which is the half a derivation cannot do for itself, an npm script being text.
 */
export const INTEGRATION_SUITES = UNIT_SUITES.filter((suite) => hasSplit(path.join(REPO_ROOT, 'packages', suite.dir)));

/**
 * The cache key of a step that runs suites: the union of what each of them reads, and nothing else.
 *
 * Every such step goes through here, so the step's key and the per-suite key are the same declaration
 * (`suiteInputs`) rather than two that have to agree. A step that builds its inputs some other way can
 * declare less than its suites read and still stamp green, which is a stale pass nothing reports — and
 * `suite-reads.spec.ts` cannot see it, because that compares each suite against `suiteInputs`, not against
 * whatever its step declared.
 *
 * The exclusion goes with it. A `repo` suite declares every source tree, `tests/packs` among them, and
 * what it wants there is the fixture packs' sources: the guards read what a pack author writes, never what
 * building one produces. Same reason `typecheck` reads around them, and the alternative — depending on the
 * step that writes them — would put a pool behind a build it does not need.
 */
function inputsForSuites(suites: readonly UnitSuite[], half: Half): Pick<ChainStep, 'inputs' | 'excludes'> {
  return {
    inputs: [...new Set(suites.flatMap((suite) => suiteInputs(suite, half)))].sort(),
    ...(suites.some((suite) => SUITE_READS[suite.dir]?.repo)
      ? { excludes: [...FIXTURE_OUTPUTS, ...FIXTURE_TEST_OUTPUT] }
      : {}),
  };
}

/**
 * One step per pool, not per suite.
 *
 * Eight steps meant eight vitest processes, which is the ceiling `docs/plans/test-unit-scheduling.md`
 * existed to remove: two schedulers with no shared budget. What the split was actually buying was the
 * per-package *cache key*, not the per-package *process*, and those are separable — the step's inputs are
 * the union across its pool, so a warm chain caches the whole step, and when it does run,
 * `test-unit-pool.ts` asks `suiteInputs` per project and passes `--project` for only the stale ones.
 *
 * Two pools rather than one because host suites resolve workspace source and the pack suite must resolve
 * the published `dist`, and Node conditions are per process: see `UnitSuite.kind`.
 */
/**
 * What a typecheck leg reads, from the scope it declares.
 *
 * Derived rather than listed, so a leg cannot carry an input set that disagrees with what it checks —
 * `typecheck-legs.spec.ts` holds the scope itself to what the leg's script names, and this turns that one
 * declaration into the key.
 *
 * **Every leg still declares the built `@abuddy` packages**, which is broader than most read and is kept
 * that way on purpose: the single `typecheck` step this replaces declared them, the edge into
 * `packages:ensure` derives from them, and the legs with no dep file — the lint, the import rules, the
 * API stamp — are exactly the ones whose reads nothing reports.
 *
 * **It does not declare the pack's `dist`, because no leg reads it.** Checked against the dep files: not
 * one of the fourteen reads `packages/default-setup/dist`. What `typecheck:pack` really reads is the 19
 * generated files under `src/__generated__`, which `compile` also writes and which `src` already covers —
 * so the edge to `compile` survives on the leg that has it, and the other fourteen stop waiting for a
 * build they never read.
 *
 * What the scope narrows is the source: an edit under the renderer no longer invalidates `typecheck:ears`.
 *
 * `dep-files.spec.ts` checks each leg's declaration against what the compiler reported reading, which is
 * the half that would catch a scope narrower than the truth.
 */
const legInputs = (leg: Leg): string[] => [...new Set(scopeOf(leg) === 'repo'
  ? [...EVERY_SOURCE, ...PACKAGE_BUILD_READS]
  : [...ROOT,
    ...(leg.alsoReads ?? []),
    ...(scopeOf(leg) as readonly string[]).flatMap(suiteWorkspace),
    ...(scopeOf(leg) as readonly string[]).flatMap((dir) => workspaceDeps(dir)).flatMap(dependencySource),
    ...PACKAGE_BUILD_READS])].sort();

/**
 * One step per typecheck leg, which is what makes the chain's scheduler the only one.
 *
 * `npm run typecheck` used to be a single step that ran eighteen legs on lanes of its own, and it had to
 * guess how many: "half the cores, because the chain runs two other lanes beside this step". That guess
 * is the two-schedulers problem `test-unit-scheduling.md` removed for the unit suites and left here, and
 * it cost a measured 63.4s in-chain against 29.3s of work, because the other lanes saturated the cores it
 * was not using. One scheduler owns every lane now, and `npm run typecheck` remains for a person running
 * it directly, where there is nothing to contend with.
 *
 * `packages:ensure` is a leg *and* a step, and it is declared as a step: the legs that read what it builds
 * derive an edge to it from `PACKAGE_BUILD_OUTPUTS`, so there is nothing for a second copy to add.
 *
 * **What it bought, measured 2026-10-01 at 84% idle, `chain --all`, three runs each:**
 *
 *     one step, its own lanes    171.0s median (169.8s-187.8s)
 *     one step per leg           169.8s median (169.6s-170.3s)
 *
 * The medians are within a second, which is the honest headline: this is a scheduling change and the
 * chain is core-bound either way. The *spread* is the result — 18s against 0.7s. A run that sometimes
 * cost 188s and sometimes 170s was two schedulers deciding independently how much of the machine to
 * take, and which one won depended on what else happened to be in flight.
 */
const TYPECHECK_STEPS: readonly ChainStep[] = TYPECHECK_LEGS
  .filter((leg) => leg.name !== 'packages:ensure')
  .map((leg) => ({
    name: leg.name,
    // Declared beside the legs (`LEG_TIMEOUT`), so the runner and this copy of the same steps cannot
    // disagree about it — they each named the class themselves until 2026-10-03.
    timeout: LEG_TIMEOUT,
    seconds: leg.seconds,
    inputs: legInputs(leg),
    // A leg reading every source tree reads around the fixture packs' build output for the same reason
    // the single step did: `tsc -p tests` compiles `e2e/**` only and `check:specifiers` filters
    // `__generated__` itself, so hashing it would tie the leg to a build it does not depend on.
    ...(scopeOf(leg) === 'repo' ? { excludes: [...FIXTURE_OUTPUTS, ...FIXTURE_TEST_OUTPUT] } : {}),
  }));

/**
 * Which step runs a pool, for the caller that has a pool and needs the step.
 *
 * **It does not generate the table's names, and that is deliberate.** `declaredAt` locates a step whose
 * name is generated by matching the *template literal* it was built from, which is how a run points at a
 * step's reasoning instead of repeating it — so replacing `name: \`test:unit:${kind}\`` with a call to this
 * made all three pool steps unlocatable and cost `chain-graph.spec.ts` two cases. The table keeps its
 * literals; this is the reverse lookup, and `unit-pool.spec.ts` holds the two to each other so neither can
 * be renamed alone.
 */
export const poolStepName = (pool: 'host' | 'pack' | 'integration'): string =>
  (pool === 'integration' ? 'test:integration' : `test:unit:${pool}`);

const POOL_STEPS: readonly ChainStep[] = (['host', 'pack'] as const).map((kind) => {
  const suites = UNIT_SUITES.filter((suite) => suite.kind === kind);
  return {
    name: `test:unit:${kind}`,
    // A pool fans out across workers, so it is the rung that stretches most on a smaller box
    timeout: 'suite' as const,
    // Measured on the pool, not summed from its suites. Summing gave the host pool 50s for a step that
    // takes 20s, because the suites overlap inside one vitest run — which is the entire point of pooling
    // them. `driftedSteps` reported it on every run.
    seconds: POOL_SECONDS[kind],
    ...inputsForSuites(suites, 'fast'),
    // It keeps a cache of its own, so the chain's `--all` has to reach inside it
    forceArgs: ['--all'],
  };
});


export const CHAIN_STEPS: readonly ChainStep[] = [
  // Takes the package build lock, so it cannot share a lane with anything else that builds
  // This step has an inner cache too — `ensurePackagesBuilt()` consults the build stamps — and one input the
  // inner layer cannot see: `ensure-packages-built.ts`. That is safe, and worth saying why rather than
  // leaving a reader to check: the file is the command over the rule, so it cannot change what "built"
  // means, and the rule itself (`BUILD_UNITS` in `@abuddy/host`) is inside every unit's own inputs. It takes
  // no `forceArgs` for a second reason — 18 call sites reach `ensurePackagesBuilt()` in a serial chain, each
  // a stat and a return, so forcing it would turn them into 18 builds behind one lock.
  // Not cached, and the 0.3s that costs is the point. Measured 2026-09-26: with the package stamps removed
  // but `dist` still on disk, this step reported `cached` — its inputs had not moved — while
  // `packagesBuiltOrRefuse()` refused, because the stamps are what it reads. Every step that guards on the
  // built packages then fails at collection (five files, thirty-three tests skipped, seen once), and whether
  // it does depends on which other step's `pretest` rebuilds the stamps first, which across three lanes is a
  // race. The step's own check is content-addressed and returns in ~0.3s warm, so a chain-level cache on top
  // of it buys nothing and is a second record of one fact.
  // `seconds` is the warm cost, which is what it does on almost every run: 0.3s, measured three times, and
  // the chain's warm floor is unchanged at 26.6s. The cold case is 14s and reports drift once — which is a
  // run where you have just changed a package's source and are rebuilding it anyway.
  // 14, not the 0.3 its warm check costs: `seconds` is what a step costs when it does its work, and this one's
  // work is the build. The paragraph on that field describes this step getting it wrong — "a timeout message
  // claiming it costs 1s healthy" — and 1 was still here until the overrun report named it, 1s -> 14s.
  { name: 'packages:ensure', timeout: 'suite', seconds: 14,
    neverCachedBecause: 'what it guarantees is recorded in stamps of its own, which this fingerprint cannot '
      + 'see; its check is ~0.3s warm, so a cache on top only adds a record that can disagree',
    inputs: [...PACKAGE_BUILD_INPUTS, 'scripts/ensure-packages-built.ts'], outputs: PACKAGE_BUILD_OUTPUTS },
  // publint and attw over the five trees npm publishes. 5.9s measured (publint 2.7s, attw 3.2s), against
  // which its only live call sites were `.github/workflows/ci.yml`, whose triggers are commented out, and the
  // publish workflow — so the artifact checks ran at the one moment they cannot be cheap.
  //
  // Not the dangling-path check, and the difference matters: publint skips any target behind a custom
  // condition (`hasCustomCondition`) and attw resolves standard conditions only, which is how 99 published
  // paths named files no tarball held. `@app/publish-checks`' `published-manifest-paths` is that check.
  //
  // It reads the published trees, which `PACKAGE_BUILD_OUTPUTS` covers along with the `dist` they are staged
  // from — the same constant `packages:ensure` declares as its outputs, so every input here is an ancestor's
  // output and the gitignored-input accounting holds without a second list to keep.
  //
  // `exclusive` because it must not overlap a build. `attw --pack <dir>` packs a tarball *inside* the tree it
  // is checking, and `stagePublishTree` removes and recreates that tree, so a rebuild landing mid-check leaves
  // attw opening a tarball that is no longer there — observed once, as
  // `ENOENT: open 'publish/abuddy-ui-0.1.0.tgz'`, and not reproducible in 20 tries against concurrent packs,
  // which is the profile of a window rather than a collision. Measured with it in, 2026-09-27 under `--all`:
  // 5.5s here, 176.7s for the chain, and not on the critical path (`packages:ensure` -> `compile` ->
  // `build:app` -> `test:packaged-authoring`, 111s), so running it alone costs its own time and no more. The
  // alternative is packing to a temp directory ourselves and handing attw the tarball, which is the fix if this
  // step ever needs to share a lane.
  /**
   * The reviewed reports of the published API, regenerated and compared.
   *
   * **A derivation, where this was a proxy and a derivation.** `api:stamp` hashed the declarations a report is
   * a function of and ran as a typecheck leg, because this cost 55s and that cost 0.6s. It costs 13.1s now
   * (measured 2026-10-05; one compiler state per package rather than one per entry, `31473b49d`), which is
   * less than `typecheck:pack`, so the proxy's whole justification went with the speedup and the stamp is
   * gone. What the stamp cost while it lived: a doc-comment edit reddened it though no report could move, a
   * package's stamp fingerprinted its dependencies' declarations so fixing one left the next red, every fix
   * wrote a committed file, and it raced a rebuild in flight — observed failing under `npm run typecheck`
   * with all three packages' declarations rewritten inside that run's window, then passing twice after with
   * nothing rebuilt. Whose build it was is not established (a second agent was in the tree), and the point
   * does not need it: the remedy a proxy names is a *write*, so `api:update` in that window records a hash
   * of a half-written tree and looks like it worked.
   *
   * Its inputs are the declarations it reads and the reports it compares against, so a hand-edited `etc/`
   * invalidates it — the one case the stamp could not see, since its key was the declarations alone.
   */
  // `suite` because it fans out — three extractions at once (`scripts/api-check.ts`) — which is the kind of
  // work that rung names. `chain-graph.spec.ts` holds every step to the rung its work implies
  { name: 'api:check', timeout: API_CHECK_TIMEOUT, seconds: 8,
    // The three packages it reports on, and nothing else that was built. It declared every build output
    // (`PACKAGE_BUILD_OUTPUTS`) until 2026-10-05, which keyed it on the `@abuddy/cli` and `@abuddy/testing`
    // bundles it never opens and on the `publish/` trees, a staged copy of the same declarations — so a CLI
    // edit re-ran it and every declaration counted twice. Measured then: 1438 declared files, 239 of them
    // read. Dropping `publish/` also drops a mutex, `packages:check` declaring those trees as `alsoWrites`.
    //
    // Each package's own `package.json` is where the entry set comes from (`reportEntries` over `exports`),
    // so it is declared outright. It used to be covered only by accident, through the derived
    // `publish/package.json` — and an entry added to a map while that was the only cover is exactly the
    // `./packs` defect the deleted stamp is remembered for.
    //
    // The extractor and its config decide what a report says, so they belong in the key beside the trees.
    // `component-contracts.ts` writes every `.component.md` and `api-entries.ts` decides which entries get a
    // report at all, so each is a module whose edit moves a report while the script that imports it does not.
    // The closure check in `chain-inputs.spec.ts` is what found them and what keeps the next one from hiding
    inputs: [...ROOT,
      'packages/abuddy-ears/dist', 'packages/abuddy-sdk/dist', 'packages/abuddy-ui/dist',
      'packages/abuddy-ears/package.json', 'packages/abuddy-sdk/package.json', 'packages/abuddy-ui/package.json',
      'scripts/api-check.ts', 'scripts/lib/api-report-packages.ts', 'scripts/lib/exit-on-epipe.ts',
      // `bounded-spawn` is how this runs the three extractions, and it was declared nowhere until
      // 2026-10-05. It had an excuse by accident: `chain-inputs.spec.ts` excuses everything reachable from
      // this file, and this file reached it through the spec-cost module, which imported `measure.ts`, which
      // imports it. Repointing that import to `spec-halves.ts` shrank the closure and the real gap showed.
      'scripts/lib/bounded-spawn.ts',
      'scripts/api-reports.ts', 'scripts/component-contracts.ts', 'scripts/lib/api-entries.ts',
      'packages/abuddy-ears/etc', 'packages/abuddy-sdk/etc', 'packages/abuddy-ui/etc',
      'packages/abuddy-ears/tsconfig.api-extractor.json', 'packages/abuddy-sdk/tsconfig.api-extractor.json',
      'packages/abuddy-ui/tsconfig.package.json'],
    // A report is a function of the declarations a package built. The compiled output beside them is what
    // `declaration: true` emits past them, and no report has ever read one
    excludeSuffixes: ['.js', '.mjs', '.cjs', '.js.map', '.mjs.map', '.cjs.map', '.css', '.css.map'] },
  { name: 'packages:check', timeout: 'quick', seconds: 6,
    // `attw --pack` packs a tarball inside each tree it checks and removes it again. Transient, so not an
    // output; real, so nothing may read those trees while it runs. This is what `exclusive: true` was.
    alsoWrites: ['packages/abuddy-ears/publish', 'packages/abuddy-sdk/publish', 'packages/abuddy-ui/publish',
      'packages/abuddy-testing/dist/package', 'packages/abuddy-cli/dist/package'],
    inputs: [...ROOT, ...PACKAGE_BUILD_OUTPUTS] },
  // Ahead of build and not redundant with it: build -ws gives no ordering guarantee, since no workspace
  // declares a dependency on @app/default-setup, and the renderer's build reads the pack entry this writes
  { name: 'compile', timeout: 'suite', seconds: 28, outputs: PACK_OUTPUTS,
    // Its sources and its manifest, not its tests: `abuddy build` never reads those
    //
    // The CLI's sources reach here through `PACKAGE_BUILD_OUTPUTS`, since an edit to them makes the
    // `@abuddy/cli` build unit stale and `packages:ensure` rewrites the bundle this declares — and what the
    // bundle does decides what this step writes.
    //
    // `etc` is the committed facade report, which the build reads to warn when the bundle it has just
    // produced has outgrown it. A read is a read, so a hand-edited report invalidates this step, even though
    // what it buys here is a warning rather than a verdict — `facade:check` below is the step that fails
    inputs: PACK_DERIVED_READS },
  /**
   * The committed facade report against the facade the pack's sources describe, re-bundled here rather than
   * read from `dist` — the `api:check` shape, a derivation with no staleness record of its own.
   *
   * **Its own step rather than a `typecheck` leg, though `exports:check` and `schema:check` are and this is
   * their shape.** Those two are the `--check` halves of generators and write nothing, which is the claim
   * `typecheck-legs.ts` makes by running its legs at once — *"nothing here writes what another leg reads"*.
   * This one runs `generateEntries`, which rewrites `src/__generated__` whenever anything under the pack's
   * `src` has moved, and `typecheck:pack` compiles out of that tree. As a leg it would race it in exactly
   * the state `npm run typecheck` is run in.
   *
   * **Here the write cannot be observed, and that is derived rather than hoped for.** Declaring
   * `packages/default-setup/src` reads what `compile` writes (`PACK_OUTPUTS` holds `src/__generated__`), so
   * `dependsOn` puts this after it; `compile` runs the same codegen, so the `.inputs-hash` matches by the
   * time this runs and the regenerate is a no-op. One declaration gives both the edge and the quiet.
   * Declaring that write instead does not work in either available shape: as an `outputs` it reverses the
   * edge into a cycle, and as an `alsoWrites` it is a mutex against twelve steps.
   *
   * `PACKAGE_BUILD_READS` is the entry to keep: the report's normalisation is the CLI's
   * (`build/facade-report.ts`, `build/declaration-text.ts`), so without it an edit there leaves this cached
   * green over a report it would now word differently.
   *
   * **No `forceArgs`, though `generateEntries` keeps a cache of its own** (`.inputs-hash`) that `--all`
   * cannot reach: a skip there cannot make this step a no-op, because the re-bundle and the comparison run
   * either way. The same reasoning `test:external-pack:contract` carries below, and it has to be written
   * down — that cache lives in `@abuddy/cli` rather than under `scripts/`, which is where `chain-table`'s
   * stamp-reading derivation looks, so nothing would report its absence.
   */
  { name: 'facade:check', timeout: 'quick', seconds: 7, inputs: PACK_DERIVED_READS },
  // The fixture packs depend on default-setup, so they need its snapshot from compile
  //
  // The third place in this chain with a cache inside a cached step, and the one that is benign: `abuddy
  // build` skips `generate-entries` when its `.inputs-hash` matches. It takes no `forceArgs` because a skip
  // there cannot make the step a no-op — the script runs four commands per fixture (`validate`, `build`,
  // `tsc --noEmit`, `test --contract`) and only the second caches anything, so the step still validates,
  // typechecks and runs the harness specs however that hash reads. That is the whole reason, and it is the
  // condition to re-check: were this step's work ever to become `abuddy build` alone, or were that skip to
  // grow to cover the typecheck or the specs, it would have the shape the pool steps had — stale for a
  // reason its inner layer cannot see, so it runs, skips everything and stamps green.
  //
  // 38s, not the 20s it takes alone: `seconds` is what a step costs under the chain's own default
  // admission, because that is the schedule the drift report compares against. Raising the lane default from
  // two to three moved this one and nothing else past the drift band, which is `driftedSteps` doing its job.
  { name: 'test:external-pack:contract', timeout: 'suite', seconds: 36, outputs: FIXTURE_OUTPUTS,
    // It declares `tests/packs` for the pack sources; the Playwright output under each pack is written
    // by `:app`, changes every run, and is read by nothing
    excludes: FIXTURE_TEST_OUTPUT,
    inputs: [...ROOT, ...BOUNDED_RUNNER, 'tests/packs', 'tests/scripts/test-external-pack-contract.sh',
      'tests/scripts/lib', ...PACKAGE_BUILD_READS, ...PACK_OUTPUTS] },
  // The widest inputs in the table, and honestly so: it compiles every workspace, the scripts and the
  // tests, and lints them. A change anywhere in the repo's TypeScript is a change to what it checks.
  ...TYPECHECK_STEPS,
  ...POOL_STEPS,
  // The CLI specs that run a real build, install or child process. They need the built packages,
  // never the app — which is why they can run before `build` rather than behind it.
  // Needs `compile` and not just `packages:ensure`, because `dependency-runtime` builds a pack that depends
  // on default-setup and so reads its `dist`. It used to run after `compile` only because of where it sat
  // in this table, which `orderedSteps` never promised.
  // `POOL_SECONDS`, not a literal: one cost declared twice drifts the moment somebody edits whichever copy
  // they found first
  // 1.94x, measured 2026-10-04: five workers to two is 42.5s -> 82.5s, median of 3 (`suite`'s own note).
  // It caps itself at half the cores, so it loses far fewer workers than the pool the rung's 4x was taken on
  { name: 'test:integration', timeout: 'suite', stretches: 1.94, seconds: POOL_SECONDS.integration,
    // It keeps a cache of its own now, like the two unit pools, so `--all` has to reach inside it
    forceArgs: ['--all'],
    ...inputsForSuites(INTEGRATION_SUITES, 'integration') },
  // `build:app`, not `build`. Root `build` is `-ws`, which includes `@app/default-setup`, whose own build is
  // the very command `compile` runs — so a `build` step rebuilt the pack every run, rewriting the `dist`
  // it declares as an input. It invalidated itself, and the five steps that read that tree, on every run:
  // measured, a warm chain cached 7 of 17 steps instead of 16. `npm run build` still builds everything, for
  // CI and `build/build.sh`; the chain does not need it to, because `compile` is a declared `need`.
  // **No pack's `src` here, and that is a property of the build rather than an omission.** Nothing compiles a
  // pack into the app any more: a pack's backend is loaded at run time from its own `dist/runtime/index.cjs`
  // and its frontend fetched over `pack://`, so what this reads of a pack is `PACK_OUTPUTS` — its `dist`,
  // which now holds both bundles. A pack source edit reaches this step through `compile`, which is a declared
  // `need`. It declared `PACK_SOURCES` while the renderer's plugin and the api's tsup each traced a generated
  // entry into the pack's `src`; `check:tiers` and the app build's own header are what keep that from coming
  // back quietly
  { name: 'build:app', timeout: 'suite', seconds: 13, outputs: APP_OUTPUTS,
    inputs: [...ROOT, ...APP_RUNNER, ...['renderer', 'api', 'main', 'preload'].flatMap(workspace),
      'packages/api/tsup.config.ts', ...APP_ENTRY,
      ...PACKAGE_BUILD_READS, ...PACK_OUTPUTS] },
  { name: 'test:external-pack:app', timeout: 'scenario', seconds: 18,
    // Its own Playwright output, rewritten every run
    excludes: FIXTURE_TEST_OUTPUT,
    // PACKAGE_BUILD_OUTPUTS because the fixture it drives *is* one: `@abuddy/testing` resolves to its
    // built bundle, which launches Electron, finds the window and bypasses onboarding. Reached by package
    // name rather than by path, so nothing that reads a step's text can see the edge
    inputs: [...ROOT, ...BOUNDED_RUNNER, 'tests/packs', 'tests/scripts/test-external-pack-app.sh',
      'tests/scripts/lib', 'playwright.config.ts', ...PACKAGE_BUILD_READS, ...APP_OUTPUTS] },
  // Never cached: it drives real Electron with real timing and is the likeliest step to be flaky, and a
  // flaky pass cached green hides an intermittent failure indefinitely. 28s is cheap enough to always pay.
  // It declares what it writes although it is never cached and so never reads a stamp: the guard that a
  // step depending on another's output says so can only see outputs that are declared, and this is the
  // tree that caused the defect — `typecheck` declared `tests`, which contains these, and could never cache.
  // The four cases that say the app is an app: it launches without crashing, reaches `connected`, has
  // its plugins, and runs in its own data dir. **This one is a gate**, where the suite around it is not.
  //
  // The distinction is what the suite failed and these pass: a regression gate has to assert something a
  // change could break, and "the app starts" is the assertion every other check silently assumes. Taking
  // the whole suite off the chain took that with it, and 3.5s is not a price worth arguing about for the
  // one check that makes a green run mean anything.
  //
  // `test` depends on it so the two never run at once: both drive Playwright at `tests/results`, which it
  // wipes at the start of a run, and a full suite is also the faster failure for having gone through this.
  //
  // **Cached, where the suite is not**, and the difference is the subject rather than the mechanism. The
  // suite is never cached because it drives real timing across fourteen files and a flaky pass cached
  // green hides an intermittent failure. These four cases are deterministic, and every input they have is
  // declared — so an unchanged stamp means the same app, and running it again asks a question already
  // answered. Uncached it put the warm chain back to 5.6s from 0.9s, which is most of what taking the
  // suite off the gate bought.
  { name: 'test:smoke', timeout: 'suite', seconds: 16,
    outputs: ['tests/results'],
    inputs: [...ROOT, 'tests/e2e/smoke', 'playwright.config.ts',
      'scripts/with-source.mjs', ...APP_ENTRY, ...PACKAGE_BUILD_READS, ...APP_OUTPUTS] },
  // The rest of the E2E suite. **Opt-in, not a gate** — `npm run chain -- --e2e`.
  //
  // It was built to be driven: to watch the app while writing a feature, and to let an agent see what it
  // built. It became a chain step, and then the reasoning about it became about caching a flaky pass —
  // which is a question you only ask of a regression gate. It has not caught one. Off the chain it costs
  // nothing and is still there when you want it, which is what it was for.
  { name: 'test', timeout: 'suite', seconds: 26,
    optInBecause: 'it is a harness for driving the app, not a regression gate; nothing has needed it to fail',
    neverCachedBecause: 'it drives real Electron, and a flaky pass cached green hides an intermittent failure',
    outputs: ['tests/results'],
    // The published trees, because the fixture every spec imports resolves `@abuddy/testing`'s built bundle
    // from one of them — and `packages:check` packs a tarball inside those trees and recreates them, which a
    // reader must not observe. Declaring them is what makes that a mutex instead of a scheduling accident;
    // the step is never cached, so it buys the ordering and costs no precision
    inputs: [...ROOT, 'tests/e2e', 'playwright.config.ts', 'scripts/with-source.mjs', ...APP_ENTRY,
      ...PACKAGE_BUILD_READS, ...APP_OUTPUTS] },
  /**
   * Two steps, split at the app boundary: only the last of the check's nine phases launches one.
   *
   * The author half hands over through `tests/authoring-handoff`, its output and the app half's input, so
   * the edge derives like any other. The work dir that names is **outside** the checkout deliberately — a
   * pack built inside it would resolve `@abuddy/*` by walking up to the workspace `node_modules`, which is
   * what the check exists to disprove — so the handoff carries a path and the archive's digest instead.
   *
   * Neither half deletes that dir: it is the author half's declared output, and a step whose output is gone
   * reads as never-built. The author half clears the previous run's at its start.
   */
  { name: 'test:packaged-authoring:author', timeout: 'scenario', seconds: 95,
    outputs: ['tests/authoring-handoff'],
    inputs: [...ROOT, ...BOUNDED_RUNNER, 'tests/scripts/test-packaged-authoring-author.sh',
      'tests/scripts/lib', ...PACKAGE_BUILD_READS] },
  { name: 'test:packaged-authoring:app', timeout: 'suite', seconds: 9,
    inputs: [...ROOT, ...BOUNDED_RUNNER, 'tests/scripts/test-packaged-authoring-app.sh',
      'tests/scripts/lib', 'tests/authoring-handoff', ...PACKAGE_BUILD_READS, ...APP_OUTPUTS] },
];
