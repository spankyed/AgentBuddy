import * as fs from 'node:fs';
import * as path from 'node:path';
import { BUILD_UNITS, repoRelative, REPO_ROOT } from '@abuddy/host/build/packages-built';
import { UNIT_SUITES, type UnitSuite } from './unit-suites.ts';
import { hasSplit } from './spec-cost.ts';
import { dependencySource, PACKAGE_DIRS, workspaceDeps } from './workspace-deps.ts';

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
 * declaration a tier; it is `needsApp` now, and the three-value version is in `docs/plans/tier-split.md`.
 */


export interface ChainStep {
  /** The npm script, as `npm run <name>` (or `npm test` for the E2E suite) */
  readonly name: string;
  /**
   * This action reads the built app, so it runs after `build:app` and its real inputs are the whole repo.
   *
   * **Declared, not derived, and that is the point.** Derive it from "does it read `APP_OUTPUTS`" and an
   * action that gains an app dependency is silently reclassified instead of refused, which is the drift
   * four attempts at a cheaper chain each recorded. `check:tiers` checks the declaration against the
   * inputs and against the step's scripts; a disagreement is the finding.
   *
   * `APP_ENTRY` is why the derivation cannot stand alone: `packages/dev-mode.js` and
   * `packages/entry-point.mjs` are *source* sitting beside the built-app constant, and three steps that
   * do not need the app declare them.
   */
  readonly needsApp?: true;
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
   * input has to be accounted for — `packages/repo-checks/tests/chain-inputs.spec.ts` fails one that is neither a step's
   * output you depend on nor listed here — because an unaccounted one is either an undeclared dependency
   * (a race) or churn that stops the step ever caching. Each entry is a claim that the step reads around
   * the tree, so it belongs with evidence.
   */
  readonly excludes?: readonly string[];
  /**
   * Runs alone: the scheduler starts it only when nothing else is running and holds everything else back
   * while it does (`chain-schedule.ts`). Two steps need that for two different reasons — `packages:ensure`
   * takes the package build lock, and `packages:check` reads the trees a build deletes and recreates — so the
   * field says what the scheduler does rather than naming one step's reason.
   */
  readonly exclusive?: true;
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
   * What this step costs **when it does its work**, in seconds, measured on this machine under the chain's
   * default two lanes. Not what it costs when it is cached: `packages:ensure` returns in 0.3s with nothing
   * stale and takes 14s when it builds, and recording the 0.3 gave a step that builds a budget sized for a
   * step that does not, and a timeout message claiming it "costs 1s healthy".
   *
   * It feeds two things — `budgetFor` turns it into a kill deadline at four times, and it is the weight on
   * the critical path — so a stale value both mis-sizes the bound and misreports the floor. It is a
   * measurement, so re-measure rather than raise it when a step legitimately grows. Every run reports a step
   * that ran past double this number, which is what keeps the table honest without anyone remembering to
   * check — and it is the direction that matters, since `budgetFor` starts killing at four times. A step that
   * came in under half is reported only by `--all` at `MEASURED_AT_LANES`: a run with steps cached, or fewer
   * lanes, has less contention and makes everything look fast, so that direction says nothing about the
   * table. `driftedSteps` finds both; `driftReport` in chain-output.ts decides which the run can answer for.
   *
   * For a step that keeps a cache of its own — the two pooled steps, which run only their stale projects —
   * it is the cost of the *whole* pool, which is what both kill budgets are sized from (`budgetFor` here, and
   * `test-unit-pool.ts`'s own inner spawn). Those steps needed no rule of their own once the gate was on the
   * run: an incremental pool run lands under half, which is the direction every step is now quiet about.
   *
   * **It is the cost in the chain at `MEASURED_AT_LANES`, not the cost alone.** Those differ by about two
   * times for a CPU-bound step — `typecheck` was 29s by itself and 63s in a three-lane run — so the number is
   * meaningless without the lane count, and saying only "what this costs when it does its work" is how a
   * two-lane measurement came to sit in a three-lane chain for two days.
   */
  readonly seconds?: number;
}

/** Every step, by name, for validating `needs` */
const BY_NAME = new Map<string, ChainStep>();

/**
 * The order to run the steps in, derived from `needs`. Throws on an unknown dependency or a cycle, before
 * anything runs: a graph that is wrong should not be discovered halfway through a six-minute chain.
 */
/**
 * The steps a run gates on: every step, minus the opt-in ones unless they were asked for.
 *
 * Refuses a graph where something needs an opt-in step, since the default run would then be missing a
 * dependency and the failure would arrive halfway through rather than here.
 */
export function chainSteps(include: readonly string[] = []): readonly ChainStep[] {
  const optIn = new Set(CHAIN_STEPS.filter((s) => s.optInBecause !== undefined).map((s) => s.name));
  const kept = CHAIN_STEPS.filter((s) => !optIn.has(s.name) || include.includes(s.name));
  const present = new Set(kept.map((s) => s.name));
  for (const step of kept) {
    for (const need of step.needs) {
      if (!present.has(need)) {
        throw new Error(`Chain step ${step.name} needs ${need}, which is opt-in — nothing may depend on one`);
      }
    }
  }
  return kept;
}

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
 * `test:external-pack` is split: its contract half runs here, before `build`, because validating,
 * building and typechecking a pack and running its harness specs needs no app — proved by running it with
 * `packages/renderer/dist` moved aside. Its Playwright half needs the app.
 *
 * `test:packaged-authoring` needs the app whole. It is a linear scenario rather than two halves: step 8
 * needs the archive step 6 produced and step 9 reads the data step 8's app seeded, so it takes a mode rather
 * than a split (Phase 2 of the goal).
 */
/**
 * The workspace graph and the toolchain: every step reads them, because a dependency moving changes what
 * any of them do. `fingerprintInputs` walks a directory, so naming one covers the files under it.
 */
// Both root vitest configs: one pools the unit projects, the other the expensive halves, and a step that
// reads either reads what its pool is made of
const ROOT = ['package.json', 'package-lock.json', 'vitest.config.ts', 'vitest.integration.config.ts'];

/**
 * Every workspace, from the one definition that decides which they are (`workspace-deps.ts`, read from the
 * root `workspaces` field). This used to walk `packages/` itself and call that "derived" — true of a new
 * directory, false of a new workspace, and these names feed `EVERY_WORKSPACE` and so every step's inputs.
 */
const PACKAGES = PACKAGE_DIRS;

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
  // `templates` is the CLI's scaffold: pack code the specifier rules read and the CLI's own suite renders,
  // so a change to one has to invalidate the steps that read the workspace
  'src', 'tests', 'scripts', 'etc', 'templates', 'index.js',
  // A pack's manifest, which `default-setup`'s specs import directly. Eleven workspaces have none
  // and the walk skips what is not there, so for those this adds a path and no bytes
  'abuddy.json',
  'package.json', 'tsconfig.json', 'tsconfig.package.json',
  'vitest.config.ts', 'vitest.integration.config.ts', 'vite.config.ts', 'vite.config.js',
  'eslint.config.ts', 'postcss.config.cjs', 'tailwind.config.ts', 'tsdown.config.ts', 'env.d.ts',
  'dev-build.mjs',
];
const workspace = (pkg: string): string[] => WORKSPACE_PARTS.map((part) => `packages/${pkg}/${part}`);

/**
 * What a *suite* reads, which is the workspace plus its guide. A fingerprint skips a `CLAUDE.md` (see `GUIDE`
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
const EVERY_SOURCE = [...ROOT, ...EVERY_WORKSPACE, 'scripts', 'tests/e2e', 'tests/packs', 'tests/scripts',
  'tests/tsconfig.json', 'playwright.config.ts', 'types', 'electron-builder.mjs',
  // The drive layer's config, and only it: the driving scripts beside it are gitignored and ad-hoc,
  // so naming the directory would re-run a typecheck every time someone poked at the app
  'drive/playwright.config.ts',
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

/** What `build` writes: the app that `needsApp` steps read */
export const APP_OUTPUTS = ['packages/renderer/dist', 'packages/api/dist', 'packages/main/dist', 'packages/preload/dist'];
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
export const PACK_OUTPUTS = ['packages/default-setup/dist', 'packages/default-setup/src/__generated__'];

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
 * One step per unit suite, so a one-package change re-runs one suite rather than eight. Measured under the
 * two-lane runner (`scripts/test-unit.ts`), which is what the chain will run them under.
 */
/**
 * Measured per pool with every project stale — `npm run chain --all`, the only run that does the whole
 * pool's work, and the run `driftedSteps` checks this number on.
 */
/**
 * The two pooled steps' whole-pool cost, in the chain at `MEASURED_AT_LANES`. Re-measured 2026-09-27 under
 * `--all` with the rest of this table: 20 and 21 were taken before `typecheck` stopped running its legs one at
 * a time, and a step that asks for half the cores makes everything beside it slower — which is where those
 * seconds went rather than being new work. It feeds two kill budgets, `budgetFor` here and the pool's own inner
 * spawn (`test-unit-pool.ts`), so it is the cost of the whole pool and not of a partial run.
 */
export const POOL_SECONDS: Record<'host' | 'pack', number> = { host: 42, pack: 30 };

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
    ...suiteWorkspace(suite.dir),
    ...workspaceDeps(suite.dir).flatMap(dependencySource),
    ...(reads.packages ? PACKAGE_BUILD_OUTPUTS : []),
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
function inputsForSuites(suites: readonly UnitSuite[]): Pick<ChainStep, 'inputs' | 'excludes'> {
  return {
    inputs: [...new Set(suites.flatMap(suiteInputs))].sort(),
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
const POOL_STEPS: readonly ChainStep[] = (['host', 'pack'] as const).map((kind) => {
  const suites = UNIT_SUITES.filter((suite) => suite.kind === kind);
  return {
    name: `test:unit:${kind}`,
    needs: ['compile'],
    // Measured on the pool, not summed from its suites. Summing gave the host pool 50s for a step that
    // takes 20s, because the suites overlap inside one vitest run — which is the entire point of pooling
    // them. `driftedSteps` reported it on every run.
    seconds: POOL_SECONDS[kind],
    ...inputsForSuites(suites),
    // It keeps a cache of its own, so the chain's `--all` has to reach inside it
    forceArgs: ['--all'],
  };
});

/**
 * The lane count every `seconds` below was measured at.
 *
 * A step's cost depends on how many other steps are running beside it, so the table is only true of one
 * schedule. `seconds: 45` for `typecheck` was measured 2026-09-25 at 07:38 under two lanes; the default became
 * three at 09:30 the same day, and nothing connected the two — it read 63s for two days and the drift band
 * happened to absorb it. The chain compares this against its own default and says so when they differ, which
 * is the connection that was missing rather than a number that was wrong.
 */
export const MEASURED_AT_LANES = 3;

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
  { name: 'packages:ensure', needs: [], seconds: 14, exclusive: true,
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
  { name: 'packages:check', needs: ['packages:ensure'], seconds: 6, exclusive: true,
    inputs: [...ROOT, ...PACKAGE_BUILD_OUTPUTS] },
  // Ahead of build and not redundant with it: build -ws gives no ordering guarantee, since no workspace
  // declares a dependency on @app/default-setup, and the renderer's build reads the pack entry this writes
  { name: 'compile', needs: ['packages:ensure'], seconds: 13, outputs: PACK_OUTPUTS,
    // Its sources and its manifest, not its tests: `abuddy build` never reads those
    //
    // This step runs `facade:check` after the build that produces its subject, so how the report is
    // normalised is part of what it accepts — edit that and a cached step would never re-run. It named
    // `scripts/facade-report.ts` for that reason until the report became `abuddy facade-report`; the CLI's
    // sources reach here through `PACKAGE_BUILD_OUTPUTS` instead, since an edit to them makes the
    // `@abuddy/cli` build unit stale and `packages:ensure` rewrites the bundle this declares
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
  { name: 'test:external-pack:contract', needs: ['compile'], seconds: 57, outputs: FIXTURE_OUTPUTS,
    // It declares `tests/packs` for the pack sources; the Playwright output under each pack is written
    // by `:app`, changes every run, and is read by nothing
    excludes: FIXTURE_TEST_OUTPUT,
    inputs: [...ROOT, ...BOUNDED_RUNNER, 'tests/packs', 'tests/scripts/test-external-pack-contract.sh',
      'tests/scripts/lib', ...PACKAGE_BUILD_OUTPUTS, ...PACK_OUTPUTS] },
  // The widest inputs in the table, and honestly so: it compiles every workspace, the scripts and the
  // tests, and lints them. A change anywhere in the repo's TypeScript is a change to what it checks.
  { name: 'typecheck', needs: ['compile'], seconds: 27,
    // `tests/e2e`, `tests/packs` and `tests/scripts`, never `tests` itself: that walk takes in
    // `tests/results`, which every Playwright run rewrites, so declaring the parent meant this step could
    // never be cached — measured against `tests/screenshots`, which the suite wrote until `91b348069` and
    // which cost a warm chain its 34s every time. Gitignored output that no step reads should be no step's
    // input, and the input-coverage guard backstops the narrowing: a tracked file under `tests/` that
    // none of these three covers fails it by name.
    // The loose modules below are here because `lint:check` is a leg of this step and reads them: its root pass
    // is `oxlint .` minus `docs/**` and the CLI's scaffold templates, which takes in every tracked JS module
    // outside those two. No step *runs* the packaging ones — they belong to `build-prod` — but a step that reads
    // a file declares it, or this one reports `cached` over a lint error in it. Measured: an unused binding in
    // `build/prod/diagnostics.mjs` failed `lint:check` while `chain --dry` planned this step as cached.
    // The `packages/` entries are the files `EVERY_WORKSPACE` cannot reach, since it walks a fixed set of parts
    // and these sit beside them: two bins, a bench, a bundler config and the two loaders at `packages/`'s root.
    // They arrived when the lint stopped ignoring `packages/**`, and the guard below named all six.
    inputs: [...EVERY_SOURCE, ...PACKAGE_BUILD_OUTPUTS, ...PACK_OUTPUTS],
    // It wants the fixture packs' sources, never their build output: `tsc -p tests` compiles `e2e/**`
    // only, and `check:specifiers` filters `__generated__` out itself — verified by deleting a fixture's
    // generated directory, which leaves it passing. Hashing that output would tie this check's freshness
    // to a build it does not depend on.
    excludes: [...FIXTURE_OUTPUTS, ...FIXTURE_TEST_OUTPUT] },
  ...POOL_STEPS,
  // The CLI specs that run a real build, install or child process. They need the built packages,
  // never the app — which is why they can run before `build` rather than behind it.
  // Needs `compile` and not just `packages:ensure`, because `dependency-runtime` builds a pack that depends
  // on default-setup and so reads its `dist`. It used to run after `compile` only because of where it sat
  // in this table, which `orderedSteps` never promised.
  { name: 'test:integration', needs: ['compile'], seconds: 60,
    ...inputsForSuites(INTEGRATION_SUITES) },
  // `build:app`, not `build`. Root `build` is `-ws`, which includes `@app/default-setup`, whose own build is
  // the very command `compile` runs — so a `build` step rebuilt the pack every run, rewriting the `dist`
  // it declares as an input. It invalidated itself, and the five steps that read that tree, on every run:
  // measured, a warm chain cached 7 of 17 steps instead of 16. `npm run build` still builds everything, for
  // CI and `build/build.sh`; the chain does not need it to, because `compile` is a declared `need`.
  { name: 'build:app', needs: ['compile'], seconds: 39, outputs: APP_OUTPUTS,
    inputs: [...ROOT, ...['renderer', 'api', 'main', 'preload'].flatMap(workspace),
      'packages/api/tsup.config.ts', ...APP_ENTRY,
      ...PACKAGE_BUILD_OUTPUTS, ...PACK_OUTPUTS] },
  { name: 'test:external-pack:app', needsApp: true, needs: ['build:app', 'test:external-pack:contract'], seconds: 24,
    // Its own Playwright output, rewritten every run
    excludes: FIXTURE_TEST_OUTPUT,
    // PACKAGE_BUILD_OUTPUTS because the fixture it drives *is* one: `@abuddy/testing` resolves to its
    // built bundle, which launches Electron, finds the window and bypasses onboarding. Reached by package
    // name rather than by path, so nothing that reads a step's text can see the edge
    inputs: [...ROOT, ...BOUNDED_RUNNER, 'tests/packs', 'tests/scripts/test-external-pack-app.sh',
      'tests/scripts/lib', 'playwright.config.ts', ...PACKAGE_BUILD_OUTPUTS, ...APP_OUTPUTS] },
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
  { name: 'test:smoke', needsApp: true, needs: ['build:app'], seconds: 6,
    outputs: ['tests/results'],
    inputs: [...ROOT, 'tests/e2e/smoke', 'playwright.config.ts',
      'scripts/with-source.mjs', ...APP_ENTRY, ...PACKAGE_BUILD_OUTPUTS, ...APP_OUTPUTS] },
  // The rest of the E2E suite. **Opt-in, not a gate** — `npm run chain -- --e2e`.
  //
  // It was built to be driven: to watch the app while writing a feature, and to let an agent see what it
  // built. It became a chain step, and then the reasoning about it became about caching a flaky pass —
  // which is a question you only ask of a regression gate. It has not caught one. Off the chain it costs
  // nothing and is still there when you want it, which is what it was for.
  { name: 'test', needsApp: true, needs: ['build:app', 'test:smoke'], seconds: 26,
    optInBecause: 'it is a harness for driving the app, not a regression gate; nothing has needed it to fail',
    neverCachedBecause: 'it drives real Electron, and a flaky pass cached green hides an intermittent failure',
    outputs: ['tests/results'],
    inputs: [...ROOT, 'tests/e2e', 'playwright.config.ts', 'scripts/with-source.mjs', ...APP_ENTRY, ...APP_OUTPUTS] },
  { name: 'test:packaged-authoring', needsApp: true, needs: ['build:app'], seconds: 59,
    inputs: [...ROOT, ...BOUNDED_RUNNER, 'tests/scripts/test-packaged-authoring.sh', 'tests/scripts/lib',
      ...PACKAGE_BUILD_OUTPUTS, ...APP_OUTPUTS] },
];
