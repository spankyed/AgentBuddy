import * as fs from 'node:fs';
import * as path from 'node:path';
import { BUILD_UNITS, REPO_ROOT } from '@abuddy/host/build/packages-built';
import { UNIT_SUITES, unitStepName } from './unit-suites.ts';

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
  /** Needs the package build lock, so it cannot share a lane with another step that takes it */
  readonly exclusive?: true;
  /** A step whose pass is not reproducible, so it always runs. Only the E2E suite, with its reason. */
  readonly cache?: false;
  /**
   * What this step costs when it is healthy, in seconds, measured on this machine. `chain.ts` turns it into
   * a wall-clock budget and kills the step's process group if it overruns — a run that can hang cannot fail.
   * It is a measurement, so re-measure it rather than raising it when a step legitimately grows. A step
   * without one still gets a bound, just a loose one.
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
 * A package's own source, its tests, its own tooling, and the files that say how it compiles, tests and
 * lints. The config files are inputs in the plain sense — a vitest config decides which specs run at all,
 * and the renderer's tailwind and postcss configs decide what `build` emits. A name that the package does
 * not have costs nothing: the walk skips what is not there.
 *
 * Not the package directory itself, which would pull `dist` into the fingerprint and miss the cache on
 * every build.
 */
const WORKSPACE_PARTS = [
  'src', 'tests', 'scripts', 'index.js',
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
/** What `compile` writes: the built-in pack every later step reads */
const PACK_OUTPUTS = ['packages/default-setup/dist'];

/** Every workspace package's npm name and where it lives, so a declared dependency can become an input path */
const DIR_BY_PACKAGE = new Map<string, string>(PACKAGES.map((dir) => [
  (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'packages', dir, 'package.json'), 'utf-8')) as { name: string }).name,
  dir,
]));

/**
 * The workspaces a package imports, transitively, read from its own package.json rather than listed here.
 * A suite compiles its `@abuddy` dependencies from source (the `@abuddy/source` condition), so their source
 * is genuinely its input — and a dependency added later is covered the moment it is declared, which a list
 * beside this would not be.
 */
function workspaceDeps(dir: string, seen = new Set<string>([dir])): string[] {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'packages', dir, 'package.json'), 'utf-8')) as {
    dependencies?: Record<string, string>; devDependencies?: Record<string, string>;
  };
  const found: string[] = [];
  for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
    const child = DIR_BY_PACKAGE.get(name);
    if (!child || seen.has(child)) continue;
    seen.add(child);
    found.push(child, ...workspaceDeps(child, seen));
  }
  return found;
}

/** A dependency contributes its source; another package's specs are not this suite's input */
const dependencySource = (pkg: string): string[] => [`packages/${pkg}/src`, `packages/${pkg}/package.json`];

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
};

/**
 * One step per unit suite, so a one-package change re-runs one suite rather than eight. Measured under the
 * two-lane runner (`scripts/test-unit.ts`), which is what the chain will run them under.
 */
const UNIT_SECONDS: Record<string, number> = {
  'abuddy-sdk': 25, 'default-setup': 20, 'abuddy-cli': 15, 'abuddy-host': 12,
  api: 6, 'abuddy-ears': 5, renderer: 3, main: 2,
};

const UNIT_STEPS: readonly ChainStep[] = UNIT_SUITES.map((suite) => {
  const reads = SUITE_READS[suite.dir] ?? {};
  return {
    name: unitStepName(suite),
    tier: 1,
    needs: reads.pack ? ['compile'] : reads.packages ? ['packages:ensure'] : [],
    seconds: UNIT_SECONDS[suite.dir],
    inputs: [
      ...ROOT,
      ...workspace(suite.dir),
      ...workspaceDeps(suite.dir).flatMap(dependencySource),
      ...(reads.packages ? PACKAGE_BUILD_OUTPUTS : []),
      ...(reads.pack ? PACK_OUTPUTS : []),
    ],
  };
});

export const CHAIN_STEPS: readonly ChainStep[] = [
  // Takes the package build lock, so it cannot share a lane with anything else that builds
  { name: 'packages:ensure', tier: 2, needs: [], seconds: 1, exclusive: true,
    inputs: [...PACKAGE_BUILD_INPUTS, 'scripts/ensure-packages-built.ts'], outputs: PACKAGE_BUILD_OUTPUTS },
  // Ahead of build and not redundant with it: build -ws gives no ordering guarantee, since no workspace
  // declares a dependency on @app/default-setup, and the renderer's build reads the pack entry this writes
  { name: 'compile', tier: 2, needs: ['packages:ensure'], seconds: 11, outputs: PACK_OUTPUTS,
    // Its sources and its manifest, not its tests: `abuddy build` never reads those
    inputs: [...ROOT, 'packages/default-setup/src', 'packages/default-setup/abuddy.json',
      'packages/default-setup/package.json', 'packages/default-setup/tsconfig.json',
      'packages/default-setup/dev-build.mjs', ...PACKAGE_BUILD_OUTPUTS] },
  // The fixture packs depend on default-setup, so they need its snapshot from compile
  { name: 'test:external-pack:contract', tier: 2, needs: ['compile'], seconds: 17,
    inputs: [...ROOT, ...BOUNDED_RUNNER, 'tests/fixtures', 'tests/scripts/test-external-pack-contract.sh',
      'tests/scripts/lib', ...PACKAGE_BUILD_OUTPUTS, ...PACK_OUTPUTS] },
  // The widest inputs in the table, and honestly so: it compiles every workspace, the scripts and the
  // tests, and lints them. A change anywhere in the repo's TypeScript is a change to what it checks.
  { name: 'typecheck', tier: 1, needs: ['compile'], seconds: 30,
    inputs: [...ROOT, ...EVERY_WORKSPACE, 'scripts', 'tests', 'types', ...PACKAGE_BUILD_OUTPUTS, ...PACK_OUTPUTS] },
  ...UNIT_STEPS,
  // The CLI specs that run a real build, install or child process. Tier 2: they need the built packages,
  // never the app — which is why they can run before `build` rather than behind it.
  // Needs `compile` and not just `packages:ensure`, because `dependency-runtime` builds a pack that depends
  // on default-setup and so reads its `dist`. It used to run after `compile` only because of where it sat
  // in this table, which `orderedSteps` never promised.
  { name: 'test:integration', tier: 2, needs: ['compile'], seconds: 43,
    inputs: [...ROOT, ...workspace('abuddy-cli'), ...PACKAGE_BUILD_OUTPUTS, ...PACK_OUTPUTS] },
  // `build:app`, not `build`. Root `build` is `-ws`, which includes `@app/default-setup`, whose own build is
  // the very command `compile` runs — so a `build` step rebuilt the pack every run, rewriting the `dist`
  // it declares as an input. It invalidated itself, and the five steps that read that tree, on every run:
  // measured, a warm chain cached 7 of 17 steps instead of 16. `npm run build` still builds everything, for
  // CI and `build/build.sh`; the chain does not need it to, because `compile` is a declared `need`.
  { name: 'build:app', tier: 3, needs: ['compile'], seconds: 37, outputs: APP_OUTPUTS,
    inputs: [...ROOT, ...['renderer', 'api', 'main', 'preload'].flatMap(workspace),
      'packages/api/tsup.config.ts', ...APP_ENTRY,
      ...PACKAGE_BUILD_OUTPUTS, ...PACK_OUTPUTS] },
  { name: 'test:external-pack:app', tier: 3, needs: ['build:app', 'test:external-pack:contract'], seconds: 20,
    inputs: [...ROOT, ...BOUNDED_RUNNER, 'tests/fixtures', 'tests/scripts/test-external-pack-app.sh',
      'tests/scripts/lib', 'playwright.config.ts', ...APP_OUTPUTS] },
  // Never cached: it drives real Electron with real timing and is the likeliest step to be flaky, and a
  // flaky pass cached green hides an intermittent failure indefinitely. 28s is cheap enough to always pay.
  { name: 'test', tier: 3, needs: ['build:app'], cache: false, seconds: 26, // the E2E suite
    inputs: [...ROOT, 'tests/e2e', 'playwright.config.ts', 'scripts/with-source.mjs', ...APP_ENTRY, ...APP_OUTPUTS] },
  { name: 'test:packaged-authoring', tier: 3, needs: ['build:app'], seconds: 60,
    inputs: [...ROOT, ...BOUNDED_RUNNER, 'tests/scripts/test-packaged-authoring.sh', 'tests/scripts/lib',
      ...PACKAGE_BUILD_OUTPUTS, ...APP_OUTPUTS] },
];
