import * as fs from 'node:fs';
import * as path from 'node:path';
import { BUILD_UNITS, REPO_ROOT } from '@abuddy/host/build/packages-built';
import { UNIT_SUITES, type UnitSuite } from './unit-suites.ts';
import { hasSplit } from './spec-cost.ts';
import { dependencySource, workspaceDeps } from './workspace-deps.ts';

/**
 * The pre-merge chain's steps and what each is allowed to read. Separate from `scripts/chain.ts` because
 * that module runs the chain when imported, and `check-test-tiers.ts` needs the table without running it.
 *
 *   1 pure      its own package's source, the in-memory runtime, fakes. No build output, no app.
 *   2 contract  the built @abuddy packages and a pack's build output. Not the app.
 *   3 app       the built app.
 *
 * A tier-1 or tier-2 step that launches the app is the coupling this taxonomy exists to catch: it welds a
 * fast check to a slow one, and the pair can then be neither cached nor reordered. `check:tiers` fails on
 * one. The reasoning and the measurements are in `docs/goals/goal-test-tiers.md`.
 */
export type Tier = 1 | 2 | 3;

export interface ChainStep {
  /** The npm script, as `npm run <name>` (or `npm test` for the E2E suite) */
  readonly name: string;
  /** What it may read. `check:tiers` enforces that tier 1 and 2 reach no app. */
  readonly tier: Tier;
  /** The steps that must pass first — the edges. The run order is derived from these, not written. */
  readonly needs: readonly string[];
  /**
   * What the step reads, repo-relative; a directory is walked. This is its cache key, the same shape
   * `BuildUnit.inputs` has, so one fingerprint protocol covers both. Repo-relative rather than absolute
   * because this table is data that a spec and two scripts import — resolving paths is the consumer's job.
   *
   * Required, not optional. Phase 3 of the goal added `needs` and `cache` and left this out, and its
   * "Done when" passed anyway because it asserted the ordering those fields were for. A missing field
   * should fail to compile rather than pass a check written for something else.
   */
  readonly inputs: readonly string[];
  /** What it writes, so a later step's `inputs` can name them instead of guessing at the same paths */
  readonly outputs?: readonly string[];
  /**
   * Generated trees inside `inputs` that this step declares the parent of and never reads. Every gitignored
   * input has to be accounted for — `chain-inputs.integration.spec.ts` fails one that is neither a step's
   * output you depend on nor listed here — because an unaccounted one is either an undeclared dependency
   * (a race) or churn that stops the step ever caching. Each entry is a claim that the step reads around
   * the tree, so it belongs with evidence.
   */
  readonly excludes?: readonly string[];
  /** Needs the package build lock, so it cannot share a lane with another step that takes it */
  readonly exclusive?: true;
  /**
   * A step the chain does not cache, with its reason on the step.
   *
   * Two kinds qualify. One is a pass that is not reproducible (the E2E suite). The other is a step whose
   * *effect* is recorded somewhere the chain's fingerprint cannot see: `packages:ensure` guarantees the
   * built packages are current, and whether they are is recorded in `node_modules/.cache/abuddy-packages-build`
   * — not in this step's inputs, and not in its outputs either, which `fingerprintUnit` excludes from the
   * content hash on purpose. Caching such a step is a second record of one fact, and the two can disagree.
   *
   * Comes with `neverCachedBecause`, which the chain prints in place of a cache verdict. It was one hardcoded
   * sentence about Electron until there were two such steps, and then it was wrong about one of them.
   */
  readonly cache?: false;
  /** Why, printed where a cached step's reason would go. Required of every `cache: false` step. */
  readonly neverCachedBecause?: string;
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
   * What this step costs **when it does its work**, in seconds, measured on this machine under the chain's
   * default two lanes. Not what it costs when it is cached: `packages:ensure` returns in 0.3s with nothing
   * stale and takes 14s when it builds, and recording the 0.3 gave a step that builds a budget sized for a
   * step that does not, and a timeout message claiming it "costs 1s healthy".
   *
   * It feeds two things — `budgetFor` turns it into a kill deadline at four times, and it is the weight on
   * the critical path — so a stale value both mis-sizes the bound and misreports the floor. It is a
   * measurement, so re-measure rather than raise it when a step legitimately grows; the chain compares
   * every run against it and prints the value to record when one has drifted past half or double
   * (`driftedSteps`), which is what keeps this table honest without anyone remembering to check.
   */
  readonly seconds?: number;
}

/**
 * What one test may take, by the tier of the step that runs it (Decision 7 of the goal: tier 1 in seconds,
 * tier 2 in tens of seconds, tier 3 up to a minute).
 *
 * The point is the ceiling, not the number. `testTimeout: 120_000` on a unit suite turns a hang into a slow
 * pass — a load-induced stall reached a chain summary as two unexplained errors rather than as a timeout.
 * Measured 2026-09-25, the slowest single test in the two suites that set that value was 2.9s
 * (`@app/default-setup`) and 0.7s (`@app/api`), so tier 1 has five times the headroom it needs.
 *
 * A suite that sets nothing gets vitest's 5s default, which is inside tier 1 already. This is a bound on
 * what a config may declare, checked by `suite-timeouts.spec.ts`, not a value the configs import: a vitest
 * config importing across package layers is the thing that rule exists to prevent.
 */
export const TIER_TIMEOUT_MS: Record<Tier, number> = { 1: 15_000, 2: 60_000, 3: 60_000 };

/** Every step, by name, for validating `needs` */
const BY_NAME = new Map<string, ChainStep>();

/**
 * The order to run the steps in, derived from `needs`. Throws on an unknown dependency or a cycle, before
 * anything runs: a graph that is wrong should not be discovered halfway through a six-minute chain.
 */
export function orderedSteps(steps: readonly ChainStep[] = CHAIN_STEPS): readonly ChainStep[] {
  BY_NAME.clear();
  for (const step of steps) {
    if (BY_NAME.has(step.name)) throw new Error(`Two chain steps named ${step.name}`);
    BY_NAME.set(step.name, step);
  }
  for (const step of steps) {
    for (const need of step.needs) {
      if (!BY_NAME.has(need)) throw new Error(`Chain step ${step.name} needs ${need}, which is not a step`);
    }
  }
  const order: ChainStep[] = [];
  const done = new Set<string>();
  const onPath = new Set<string>();
  const visit = (step: ChainStep): void => {
    if (done.has(step.name)) return;
    if (onPath.has(step.name)) throw new Error(`Chain steps form a cycle through ${step.name}`);
    onPath.add(step.name);
    for (const need of step.needs) visit(BY_NAME.get(need)!);
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
 * `test:external-pack` is split: its contract half runs here in tier 2, before `build`, because validating,
 * building and typechecking a pack and running its harness specs needs no app — proved by running it with
 * `packages/renderer/dist` moved aside. Its Playwright half stays tier 3.
 *
 * `test:packaged-authoring` is still tier 3 whole. It is a linear scenario rather than two halves: step 8
 * needs the archive step 6 produced and step 9 reads the data step 8's app seeded, so it takes a mode rather
 * than a split (Phase 2 of the goal).
 */
/**
 * The workspace graph and the toolchain: every step reads them, because a dependency moving changes what
 * any of them do. `fingerprintInputs` walks a directory, so naming one covers the files under it.
 */
const ROOT = ['package.json', 'package-lock.json', 'vitest.config.ts'];

/** Every `packages/*` holding a package.json, derived rather than listed so a new one is covered by default */
const PACKAGES = fs.readdirSync(path.join(REPO_ROOT, 'packages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(REPO_ROOT, 'packages', entry.name, 'package.json')))
  .map((entry) => entry.name)
  .sort();

/**
 * A package's own source, its tests, its own tooling, its recorded artifacts, and the files that say how it
 * compiles, tests and lints. `etc` is there because a spec reads it back: `suite-split.spec.ts` decides
 * which half every spec runs in from `etc/spec-cost.json`, so a change to that record has to re-run the
 * suite that asserts on it. The config files are inputs in the plain sense — a vitest config decides which specs run at all,
 * and the renderer's tailwind and postcss configs decide what `build` emits. A name that the package does
 * not have costs nothing: the walk skips what is not there.
 *
 * Not the package directory itself, which would pull `dist` into the fingerprint and miss the cache on
 * every build.
 */
const WORKSPACE_PARTS = [
  'src', 'tests', 'scripts', 'etc', 'index.js',
  'package.json', 'tsconfig.json', 'tsconfig.package.json',
  'vitest.config.ts', 'vitest.integration.config.ts', 'vite.config.ts', 'vite.config.js',
  'eslint.config.ts', 'postcss.config.cjs', 'tailwind.config.ts', 'tsdown.config.ts', 'env.d.ts',
];
const workspace = (pkg: string): string[] => WORKSPACE_PARTS.map((part) => `packages/${pkg}/${part}`);

/** Every workspace: what `typecheck` reads, since it compiles the repo rather than a package */
const EVERY_WORKSPACE = PACKAGES.flatMap(workspace);

/**
 * `packages:ensure` builds the publishable packages, so its inputs are theirs — taken from `BUILD_UNITS`
 * rather than copied beside it. A copy of someone else's input list is the thing that goes stale silently:
 * a file added to a build unit would leave this step cached against a key that never saw it.
 */
const relative = (absolute: string): string => path.relative(REPO_ROOT, absolute);
const PACKAGE_BUILD_INPUTS = [...new Set(Object.values(BUILD_UNITS).flatMap((unit) => unit.inputs.map(relative)))].sort();
const PACKAGE_BUILD_OUTPUTS = [...new Set(Object.values(BUILD_UNITS).flatMap((unit) => unit.outputs.map(relative)))].sort();

/** What `build` writes: the app the tier-3 steps read */
const APP_OUTPUTS = ['packages/renderer/dist', 'packages/api/dist', 'packages/main/dist', 'packages/preload/dist'];
/** The Electron entry and the dev-mode switch: not inside a package, and read by anything that starts the app */
const APP_ENTRY = ['packages/entry-point.mjs', 'packages/dev-mode.js'];
/** The wrapper a shell-script step runs through, and the module that bounds it */
const BOUNDED_RUNNER = ['scripts/bounded.ts', 'scripts/lib/bounded-spawn.ts'];

/**
 * What *runs* a unit suite, as against what the suite reads — and an input to every project all the same.
 *
 * These decide what runs and how: the runner picks which projects a pool runs, `unit-suites.ts` says which
 * pool a suite is even in, `with-source.mjs` supplies the `@abuddy/source` condition the host suites
 * resolve under, and the bounded runner bounds the spawn. A pass recorded before one of them changed is not
 * evidence about the pass after it, so a project whose runner moved is stale.
 *
 * **They used to be declared on the pool step and on no project, which is the defect this fixes.** The step
 * went stale, ran, asked each project and found them all fresh, printed "all N project(s) up to date" and
 * stamped green having tested nothing — and the five files it could not notice changing were the five that
 * decide whether the suites run correctly at all. Changing a suite's `kind` was the worst of them: the
 * destination pool's step went stale, the suite's stamp was keyed by directory rather than by pool, and it
 * ran in neither.
 */
const SUITE_RUNNER = ['scripts/test-unit-pool.ts', 'scripts/lib/unit-suites.ts', 'scripts/with-source.mjs', ...BOUNDED_RUNNER];
/**
 * What `compile` writes. `src/__generated__` is under the `src` it also reads, so it has to be declared:
 * `fingerprintUnit` excludes a unit's own output from its own fingerprint, and that is what stops the step
 * invalidating itself the first time codegen stops being byte-identical.
 */
const PACK_OUTPUTS = ['packages/default-setup/dist', 'packages/default-setup/src/__generated__'];

/**
 * What building the fixture packs writes, derived from the fixtures themselves. These sit *inside*
 * `tests/fixtures`, which the same step declares as an input, for the same reason as above.
 */
const FIXTURE_PACKS = fs.readdirSync(path.join(REPO_ROOT, 'tests', 'fixtures'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(REPO_ROOT, 'tests', 'fixtures', entry.name, 'abuddy.json')))
  .map((entry) => entry.name)
  .sort();
const FIXTURE_OUTPUTS = FIXTURE_PACKS.flatMap((name) => [`tests/fixtures/${name}/dist`, `tests/fixtures/${name}/src/__generated__`]);

/**
 * What running a fixture pack's own Playwright suite leaves behind. Nothing reads it, and it changes every
 * run, so a step that declares `tests/fixtures` has to say it reads around this or it can never cache.
 */
const FIXTURE_TEST_OUTPUT = FIXTURE_PACKS.flatMap((name) => [`tests/fixtures/${name}/tests/results`, `tests/fixtures/${name}/tests/screenshots`]);

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
export const SUITE_READS: Record<string, { packages?: true; pack?: true }> = {
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
  // `pretest: ensure-packages-built`; `published-sdk-peers` reads the built `dist` and skips without it
  'repo-checks': { packages: true },
  // `pretest: ensure-packages-built`; it npm-packs the built packages into a consumer and compiles it
  'publish-checks': { packages: true },
};

/**
 * One step per unit suite, so a one-package change re-runs one suite rather than eight. Measured under the
 * two-lane runner (`scripts/test-unit.ts`), which is what the chain will run them under.
 */
/** Measured per pool under the chain's own lanes, which is what `seconds` means (`driftedSteps` keeps it honest) */
export const POOL_SECONDS: Record<'host' | 'pack', number> = { host: 20, pack: 21 };

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
 */
export function suiteInputs(suite: UnitSuite): string[] {
  const reads = SUITE_READS[suite.dir] ?? {};
  return [
    ...ROOT,
    ...SUITE_RUNNER,
    ...workspace(suite.dir),
    ...workspaceDeps(suite.dir).flatMap(dependencySource),
    ...(reads.packages ? PACKAGE_BUILD_OUTPUTS : []),
    ...(reads.pack ? PACK_OUTPUTS : []),
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
const POOL_STEPS: readonly ChainStep[] = (['host', 'pack'] as const).map((kind) => {
  const suites = UNIT_SUITES.filter((suite) => suite.kind === kind);
  return {
    name: `test:unit:${kind}`,
    tier: 1,
    needs: ['compile'],
    // Measured on the pool, not summed from its suites. Summing gave the host pool 50s for a step that
    // takes 20s, because the suites overlap inside one vitest run — which is the entire point of pooling
    // them. `driftedSteps` reported it on every run.
    seconds: POOL_SECONDS[kind],
    // Nothing but the union, so the step cannot go stale for a reason no project can see. The runner files
    // this used to add by hand are in `suiteInputs` now, where both layers read them.
    inputs: [...new Set(suites.flatMap(suiteInputs))].sort(),
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
  { name: 'packages:ensure', tier: 2, needs: [], seconds: 1, exclusive: true, cache: false,
    neverCachedBecause: 'what it guarantees is recorded in stamps of its own, which this fingerprint cannot '
      + 'see; its check is ~0.3s warm, so a cache on top only adds a record that can disagree',
    inputs: [...PACKAGE_BUILD_INPUTS, 'scripts/ensure-packages-built.ts'], outputs: PACKAGE_BUILD_OUTPUTS },
  // Ahead of build and not redundant with it: build -ws gives no ordering guarantee, since no workspace
  // declares a dependency on @app/default-setup, and the renderer's build reads the pack entry this writes
  { name: 'compile', tier: 2, needs: ['packages:ensure'], seconds: 13, outputs: PACK_OUTPUTS,
    // Its sources and its manifest, not its tests: `abuddy build` never reads those
    inputs: [...ROOT, 'packages/default-setup/src', 'packages/default-setup/abuddy.json',
      'packages/default-setup/package.json', 'packages/default-setup/tsconfig.json',
      'packages/default-setup/dev-build.mjs', ...PACKAGE_BUILD_OUTPUTS] },
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
  // 38s, not the 20s it takes alone: `seconds` is what a step costs under the chain's own default lanes,
  // because that is what `budgetFor` has to cover. Raising the default from two to three moved this one and
  // nothing else past the drift band, which is `driftedSteps` doing its job.
  { name: 'test:external-pack:contract', tier: 2, needs: ['compile'], seconds: 38, outputs: FIXTURE_OUTPUTS,
    // It declares `tests/fixtures` for the pack sources; the Playwright output under each pack is written
    // by `:app`, changes every run, and is read by nothing
    excludes: FIXTURE_TEST_OUTPUT,
    inputs: [...ROOT, ...BOUNDED_RUNNER, 'tests/fixtures', 'tests/scripts/test-external-pack-contract.sh',
      'tests/scripts/lib', ...PACKAGE_BUILD_OUTPUTS, ...PACK_OUTPUTS] },
  // The widest inputs in the table, and honestly so: it compiles every workspace, the scripts and the
  // tests, and lints them. A change anywhere in the repo's TypeScript is a change to what it checks.
  { name: 'typecheck', tier: 1, needs: ['compile'], seconds: 45,
    // `tests/e2e`, `tests/fixtures` and `tests/scripts`, never `tests` itself: that walk takes in
    // `tests/screenshots`, which the E2E step rewrites on every run, so declaring the parent meant this
    // step could never be cached — measured, 26 screenshot files, and a warm chain paid its 34s every
    // time for nothing. Gitignored output that no step reads should be no step's input, and the
    // input-coverage guard backstops the narrowing: a tracked file under `tests/` that none of these
    // three covers fails it by name.
    inputs: [...ROOT, ...EVERY_WORKSPACE, 'scripts', 'tests/e2e', 'tests/fixtures', 'tests/scripts',
      'tests/tsconfig.json', 'playwright.config.ts', 'types', ...PACKAGE_BUILD_OUTPUTS, ...PACK_OUTPUTS],
    // It wants the fixture packs' sources, never their build output: `tsc -p tests` compiles `e2e/**`
    // only, and `check:specifiers` filters `__generated__` out itself — verified by deleting a fixture's
    // generated directory, which leaves it passing. Hashing that output would tie a tier-1 check's
    // freshness to a tier-2 build it does not depend on.
    excludes: [...FIXTURE_OUTPUTS, ...FIXTURE_TEST_OUTPUT] },
  ...POOL_STEPS,
  // The CLI specs that run a real build, install or child process. Tier 2: they need the built packages,
  // never the app — which is why they can run before `build` rather than behind it.
  // Needs `compile` and not just `packages:ensure`, because `dependency-runtime` builds a pack that depends
  // on default-setup and so reads its `dist`. It used to run after `compile` only because of where it sat
  // in this table, which `orderedSteps` never promised.
  { name: 'test:integration', tier: 2, needs: ['compile'], seconds: 52,
    inputs: [...ROOT, ...INTEGRATION_SUITES.flatMap((suite) => workspace(suite.dir)),
      ...PACKAGE_BUILD_OUTPUTS, ...PACK_OUTPUTS] },
  // `build:app`, not `build`. Root `build` is `-ws`, which includes `@app/default-setup`, whose own build is
  // the very command `compile` runs — so a `build` step rebuilt the pack every run, rewriting the `dist`
  // it declares as an input. It invalidated itself, and the five steps that read that tree, on every run:
  // measured, a warm chain cached 7 of 17 steps instead of 16. `npm run build` still builds everything, for
  // CI and `build/build.sh`; the chain does not need it to, because `compile` is a declared `need`.
  { name: 'build:app', tier: 3, needs: ['compile'], seconds: 39, outputs: APP_OUTPUTS,
    inputs: [...ROOT, ...['renderer', 'api', 'main', 'preload'].flatMap(workspace),
      'packages/api/tsup.config.ts', ...APP_ENTRY,
      ...PACKAGE_BUILD_OUTPUTS, ...PACK_OUTPUTS] },
  { name: 'test:external-pack:app', tier: 3, needs: ['build:app', 'test:external-pack:contract'], seconds: 24,
    // Its own Playwright output, rewritten every run
    excludes: FIXTURE_TEST_OUTPUT,
    inputs: [...ROOT, ...BOUNDED_RUNNER, 'tests/fixtures', 'tests/scripts/test-external-pack-app.sh',
      'tests/scripts/lib', 'playwright.config.ts', ...APP_OUTPUTS] },
  // Never cached: it drives real Electron with real timing and is the likeliest step to be flaky, and a
  // flaky pass cached green hides an intermittent failure indefinitely. 28s is cheap enough to always pay.
  // It declares what it writes although it is never cached and so never reads a stamp: the guard that a
  // step depending on another's output says so can only see outputs that are declared, and this is the
  // tree that caused the defect — `typecheck` declared `tests`, which contains these, and could never cache.
  { name: 'test', tier: 3, needs: ['build:app'], cache: false, seconds: 26, // the E2E suite
    neverCachedBecause: 'it drives real Electron, and a flaky pass cached green hides an intermittent failure',
    outputs: ['tests/screenshots', 'tests/results'],
    inputs: [...ROOT, 'tests/e2e', 'playwright.config.ts', 'scripts/with-source.mjs', ...APP_ENTRY, ...APP_OUTPUTS] },
  { name: 'test:packaged-authoring', tier: 3, needs: ['build:app'], seconds: 59,
    inputs: [...ROOT, ...BOUNDED_RUNNER, 'tests/scripts/test-packaged-authoring.sh', 'tests/scripts/lib',
      ...PACKAGE_BUILD_OUTPUTS, ...APP_OUTPUTS] },
];
