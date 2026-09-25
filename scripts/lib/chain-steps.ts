import * as fs from 'node:fs';
import * as path from 'node:path';
import { BUILD_UNITS, REPO_ROOT } from '@abuddy/host/build/packages-built';

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

/** Every workspace: what `typecheck` and `test:unit` read, since both cover the repo rather than a package */
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
  { name: 'test:unit', tier: 1, needs: ['compile'], seconds: 43,
    inputs: [...ROOT, ...EVERY_WORKSPACE, 'scripts/test-unit.ts', 'scripts/lib/bounded-spawn.ts',
      ...PACKAGE_BUILD_OUTPUTS, ...PACK_OUTPUTS] },
  // The CLI specs that run a real build, install or child process. Tier 2: they need the built packages,
  // never the app — which is why they can run before `build` rather than behind it.
  { name: 'test:integration', tier: 2, needs: ['packages:ensure'], seconds: 43,
    // default-setup's dist too: dependency-runtime builds a pack that depends on it
    inputs: [...ROOT, ...workspace('abuddy-cli'), ...PACKAGE_BUILD_OUTPUTS, ...PACK_OUTPUTS] },
  { name: 'build', tier: 3, needs: ['compile'], seconds: 37, outputs: APP_OUTPUTS,
    inputs: [...ROOT, ...['renderer', 'api', 'main', 'preload'].flatMap(workspace),
      'packages/api/tsup.config.ts', ...APP_ENTRY,
      ...PACKAGE_BUILD_OUTPUTS, ...PACK_OUTPUTS] },
  { name: 'test:external-pack:app', tier: 3, needs: ['build', 'test:external-pack:contract'], seconds: 20,
    inputs: [...ROOT, ...BOUNDED_RUNNER, 'tests/fixtures', 'tests/scripts/test-external-pack-app.sh',
      'tests/scripts/lib', 'playwright.config.ts', ...APP_OUTPUTS] },
  // Never cached: it drives real Electron with real timing and is the likeliest step to be flaky, and a
  // flaky pass cached green hides an intermittent failure indefinitely. 28s is cheap enough to always pay.
  { name: 'test', tier: 3, needs: ['build'], cache: false, seconds: 26, // the E2E suite
    inputs: [...ROOT, 'tests/e2e', 'playwright.config.ts', 'scripts/with-source.mjs', ...APP_ENTRY, ...APP_OUTPUTS] },
  { name: 'test:packaged-authoring', tier: 3, needs: ['build'], seconds: 60,
    inputs: [...ROOT, ...BOUNDED_RUNNER, 'tests/scripts/test-packaged-authoring.sh', 'tests/scripts/lib',
      ...PACKAGE_BUILD_OUTPUTS, ...APP_OUTPUTS] },
];
