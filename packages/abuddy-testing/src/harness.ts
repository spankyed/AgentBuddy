// Unit tests for a pack without the app, on the pack's own @abuddy/sdk (registrations are the ones
// the pack's code sees). Two tiers:
// - data: the pack's seeds, repositories and seed hooks against an in-memory EARS, with its
//   dependencies' seeding behaviour (their seed runtimes);
// - runtime (with `registration`): also its systems, services and steps, and its dependencies' full
//   runtimes, run under the app's bus core with `startApp`.
//
//   // tests/setup.ts (vitest setupFiles, after isolatedDataDir's)
//   import { seedRuntime } from '#generated/seed-runtime';
//   import { registration } from '#generated/pack-entry';
//   import { setupPackTests } from '@abuddy/testing/harness';
//   await setupPackTests({ seedRuntime, registration });
import { assertCheckoutPackagesFresh } from './checkout-freshness.ts';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, inject, type RunnerTask, type RunnerTestCase } from 'vitest';
import { resetTestData as resetSdkTestData, startTestRuntime, takeSystemErrors, addTestSecret, type SeedRuntime, fakeInference, type FakeInference } from '@abuddy/sdk/testing';
import type { PackRegistryView } from '@abuddy/sdk/runtime';
import type { PackRegistration } from '@abuddy/sdk/framework';
import { createPackRegistry, hostRegistration, type PackOrigin } from '@abuddy/host/packs';
import { appState, HOST_ENTITY_TYPES } from '@abuddy/host/app-state';
import { loadDependencyRuntime } from './dependency-runtime.ts';
import { assertSharedEars } from './shared-ears.ts';
import { setAppPacks, stopRunningApps } from './app.ts';
import { PROJECT_ROOT_KEY } from './vitest-teardown.ts';
import { compileFlowDSL, compilePack, resolveSeeds, SEED_INDEX_FILE, _snapshotFormatMismatch, type FlowDSL, type PackManifest, type PackSnapshot, type SeedDependency, type SeedIndex } from '@abuddy/sdk/build';
import { actionRepository, flowRepository, promptRepository } from '@abuddy/sdk/repositories';
import { untypedQx } from '@abuddy/ears';
import { _getMediaPath, seedData, type ImportMode, type SeedCounts, type Seeder } from '@abuddy/sdk/utils';

export { takeSystemErrors, addTestSecret, type SeedRuntime };

/**
 * Where the media a test's seeds wrote lands: the store itself, or one row's folder
 * (`media/<entityId>/<file>`). A pack's tests read and assert on it through this; the path itself is
 * the app's, and the data dir is this package's contract (`isolatedDataDir`).
 */
export function testMediaPath(entityId?: string): string {
  return entityId ? path.join(_getMediaPath(), entityId) : _getMediaPath();
}

/**
 * Empties what a test wrote: the in-memory database and the stored keys (the SDK's `resetTestData`),
 * and the media store with them, which is what a test between tests expects. The harness calls it
 * before each test; a test that reseeds mid-run calls it itself.
 */
export function resetTestData(): void {
  resetSdkTestData();
  fs.rmSync(testMediaPath(), { recursive: true, force: true });
}
export { startApp, type StartAppOptions, type TestApp, type Message, type PluginEvent, type FlowRun, type FlowStepTrace, type RunFlowOptions } from './app.ts';

const serviceMocks = new Map<string, unknown>();
/**
 * Whether a test (with its beforeEach and afterEach hooks) is running, so mocks have a test to last for. Mocks,
 * the database and running apps are per file, not per test: the harness rejects concurrent tests.
 */
let inTest = false;

/** The test file's registered packs: the pack under test and its dependencies, and any other pack a test registers */
const registry = createPackRegistry();
// The app's own plugins (the shell, the Packs tab), which a pack's systems may send to; the harness runs none of the
// host's systems
registry.registerPack(hostRegistration());
setAppPacks(registry);

/** The registered packs the harness binds, with the current test's mocked services over the registered ones */
const packsWithMocks: PackRegistryView = {
  ...registry,
  getRegisteredServices: () => ({ ...registry.getRegisteredServices(), ...Object.fromEntries(serviceMocks) }),
};

/**
 * Registers another pack in the test file's registry, as the app registers an installed one: its commands, feature
 * settings, seeders, services and the rest are what the pack under test then reads. Unregister it when the test is done.
 */
export function registerPack(registration: PackRegistration): void {
  registry.registerPack(registration);
}

/** Unregisters a pack `registerPack` registered */
export function unregisterPack(packId: string): void {
  registry.unregisterPack(packId);
}

/**
 * Replaces a service in `services` for the current test, restored after it: call it in the test or a
 * `beforeEach`, not `beforeAll`. Type it with the pack's services (`mockService<Services>('scheduler',
 * { registerSchedule: … })`); give only the members the code under test uses. Code that imports a
 * service module directly instead of using `services` isn't affected.
 */
export function mockService<S extends object = Record<string, object>, K extends keyof S & string = keyof S & string>(name: K, implementation: Partial<S[K]>): void {
  if (!inTest) {
    throw new Error(`mockService('${name}') ran outside a test: a mock lasts for the test it's made in, so make it in the test or a beforeEach`);
  }
  serviceMocks.set(name, implementation);
}

/**
 * Mocks `services.inference` for the current test with a `fakeInference` whose language model answers `reply` and
 * whose other models answer `replies`; returns it, so the test can assert its `calls`.
 */
export function mockInference(...args: Parameters<typeof fakeInference>): FakeInference {
  const inference = fakeInference(...args);
  mockService('inference', inference);
  return inference;
}

/** Where `abuddy build` caches a dependency's snapshot and build/ in a pack */
const DEPS_DIR = path.join('.abuddy', 'deps');
const SEED_RUNTIME_FILE = 'seed-runtime.mjs';

export interface PackTestOptions {
  /** The pack's own seed runtime: `import { seedRuntime } from '#generated/seed-runtime'` */
  seedRuntime: SeedRuntime;
  /**
   * The pack's runtime registration, `import { registration } from '#generated/pack-entry'`: registers
   * its systems, services, steps and designations, and loads each dependency's full runtime instead
   * of its seed runtime, for `startApp`.
   */
  registration?: PackRegistration;
  /**
   * Without `registration`, the pack's seeders, `import { seeders } from '#generated/seeders'`, which `seedPack` runs
   * (a registration carries its own)
   */
  seeders?: Seeder[];
  /**
   * The pack root (with abuddy.json); defaults to the nearest one at or above the vitest project's root (`--root`,
   * `test.root`, a workspace project's dir), given by isolatedDataDir's globalSetup, else the working directory
   */
  packDir?: string;
}

interface PackContext {
  packDir: string;
  manifest: PackManifest;
  dependencies: Map<string, SeedDependency>;
}

let context: PackContext | undefined;

const runs = (task: RunnerTask): boolean => task.mode !== 'skip' && task.mode !== 'todo' && (task.type !== 'suite' || task.tasks.some(runs));
const contains = (task: RunnerTask, test: Readonly<RunnerTestCase>): boolean => task === test || (task.type === 'suite' && task.tasks.some((child) => contains(child, test)));

/**
 * Whether another test in the file can run while `test` does: vitest runs a suite's consecutive concurrent children
 * together, so `test`, or a suite holding it, is concurrent next to a sibling that runs tests too
 */
function runsAlongsideAnother(test: Readonly<RunnerTestCase>): boolean {
  const search = (suite: RunnerTask): boolean => {
    if (suite.type !== 'suite') return false;
    const holder = suite.tasks.find((child) => contains(child, test));
    if (!holder) return false;
    if (holder.concurrent === true) {
      const index = suite.tasks.indexOf(holder);
      let start = index;
      while (start > 0 && suite.tasks[start - 1].concurrent === true) start--;
      let end = index;
      while (end < suite.tasks.length - 1 && suite.tasks[end + 1].concurrent === true) end++;
      if (suite.tasks.slice(start, end + 1).some((child) => child !== holder && runs(child))) return true;
    }
    return search(holder);
  };
  return search(test.file);
}

/** The vitest project's root, when isolatedDataDir's globalSetup provided it */
function projectRoot(): string | undefined {
  const root = (inject as (key: string) => unknown)(PROJECT_ROOT_KEY);
  return typeof root === 'string' ? root : undefined;
}

function findPackDir(from: string): string {
  for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'abuddy.json'))) return dir;
    if (path.dirname(dir) === dir) throw new Error(`No abuddy.json in ${from} or above it; pass packDir to setupPackTests`);
  }
}

type CachedDependency = SeedDependency & { snapshot: PackSnapshot; dir: string };

function readDependencies(packDir: string, manifest: PackManifest): Map<string, CachedDependency> {
  const dependencies = new Map<string, CachedDependency>();
  for (const depId of Object.keys(manifest.dependencies ?? {})) {
    const dir = path.join(packDir, DEPS_DIR, depId);
    const snapshotFile = path.join(dir, 'snapshot.json');
    if (!fs.existsSync(snapshotFile)) {
      throw new Error(`Dependency "${depId}" isn't in ${path.join(DEPS_DIR, depId)}. Run \`abuddy build\` once to fetch dependencies.`);
    }
    const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf-8')) as PackSnapshot;
    const mismatch = _snapshotFormatMismatch(snapshot);
    if (mismatch) throw new Error(`Dependency "${depId}" in ${path.join(DEPS_DIR, depId)}: ${mismatch}. Run \`abuddy build\` to fetch it again.`);
    const buildDir = path.join(dir, 'build');
    dependencies.set(depId, { snapshot, dir, manifest: snapshot.manifest, ...(fs.existsSync(buildDir) && { buildDir }) });
  }
  return dependencies;
}

/** Where a pack came from, as the app records it */
function originOf(manifest: PackManifest, dir: string): PackOrigin {
  return { id: manifest.id, name: manifest.name, version: manifest.version, dir, builtIn: manifest.builtIn === true, manifest };
}

/** A seed runtime as a registration: its entity types, repositories and seed hooks, and the pack's seeders */
function seedRuntimeRegistration(runtime: SeedRuntime, seeders?: Seeder[]): PackRegistration {
  return {
    id: runtime.id,
    ears: { entities: runtime.entities, relKinds: runtime.relKinds },
    repositories: runtime.repositories,
    seedHooks: runtime.seedHooks,
    seeders,
  };
}

/**
 * Starts the in-memory runtime for the pack's tests: entity types of the SDK, the pack and its
 * dependencies; each dependency's seed runtime (its repositories and seed hooks) and the pack's own
 * registered in the test file's registry; the database emptied before each test. Call it once, from a vitest setup file.
 */
export async function setupPackTests(options: PackTestOptions): Promise<void> {
  // From a checkout, this bundle is built on demand: refuse to test yesterday's packages silently
  assertCheckoutPackagesFresh();
  if (context) {
    throw new Error(
      'setupPackTests() already ran in this process. Call it once, from a vitest setup file, and keep vitest\'s ' +
      '`isolate` on (the default): the harness keeps one registry, database and set of mocks per test file, ' +
      'so test files sharing a module instance (`isolate: false`) would register the same packs twice',
    );
  }
  if (!process.env.ABUDDY_USER_DATA_DIR) {
    throw new Error('ABUDDY_USER_DATA_DIR is unset: use isolatedDataDir() from @abuddy/testing/vitest in vitest.config.ts');
  }
  const packDir = options.packDir ?? findPackDir(projectRoot() ?? process.cwd());
  assertSharedEars(packDir);
  const manifest = JSON.parse(fs.readFileSync(path.join(packDir, 'abuddy.json'), 'utf-8')) as PackManifest;
  const dependencies = readDependencies(packDir, manifest);

  startTestRuntime({
    // The host's entity types (AppState) too: the app's state lives in the database, as in the app
    entityTypes: [...HOST_ENTITY_TYPES, ...[...dependencies.values()].flatMap(({ snapshot }) => Object.values(snapshot.types.entities))],
    packs: packsWithMocks,
    onboarding: {
      hasOnboarded: () => appState.get().hasOnboarded,
      completeOnboarding: () => appState.update({ hasOnboarded: true }),
    },
  });
  if (options.registration) {
    await registerRuntimes(packDir, manifest, dependencies, options.registration);
  } else {
    for (const [depId, dependency] of dependencies) {
      const file = dependency.buildDir && path.join(dependency.buildDir, SEED_RUNTIME_FILE);
      if (!file || !fs.existsSync(file)) {
        throw new Error(`Dependency "${depId}" has no ${SEED_RUNTIME_FILE}; rebuild it, or update AgentBuddy for built-in packs, then run \`abuddy build\` again`);
      }
      const { seedRuntime } = await import(pathToFileURL(file).href) as { seedRuntime: SeedRuntime };
      startTestRuntime({ entityTypes: Object.values(seedRuntime.entities) });
      registry.registerPack(seedRuntimeRegistration(seedRuntime), originOf(dependency.manifest, dependency.dir));
    }
    startTestRuntime({ entityTypes: Object.values(options.seedRuntime.entities) });
    registry.registerPack(seedRuntimeRegistration(options.seedRuntime, options.seeders), originOf(manifest, packDir));
    setAppPacks(registry, manifest.id);
  }

  context = { packDir, manifest, dependencies };
  beforeEach(({ task }) => {
    if (task.concurrent && runsAlongsideAnother(task)) {
      throw new Error(`"${task.name}" runs concurrently: harness tests share one database, service mocks and apps per file, so run them sequentially (no .concurrent or sequence.concurrent)`);
    }
    inTest = true;
    resetTestData();
  });
  afterEach(() => {
    inTest = false;
    // Every cleanup runs, whichever fails
    const failures: unknown[] = [];
    try {
      stopRunningApps();
    } catch (error) {
      failures.push(error);
    }
    serviceMocks.clear();
    const errors = takeSystemErrors();
    if (errors.length > 0) {
      const described = errors.map((e) => `${e.source ?? 'unknown'}: ${e.message}`);
      failures.push(new Error(`Systems reported errors the test didn't take (takeSystemErrors()):\n  ${described.join('\n  ')}`));
    }
    if (failures.length > 0) throw failures.length === 1 ? failures[0] : new AggregateError(failures, 'Cleaning up after the test failed');
  });
}

/** Registers the pack's runtime and its dependencies' (loaded from their cached runtime/index.cjs), as the app does */
async function registerRuntimes(packDir: string, manifest: PackManifest, dependencies: ReadonlyMap<string, CachedDependency>, registration: PackRegistration): Promise<void> {
  for (const [depId, dependency] of dependencies) {
    const runtimeEntry = path.join(dependency.dir, 'runtime', 'index.cjs');
    if (!fs.existsSync(runtimeEntry)) {
      throw new Error(`Dependency "${depId}" has no runtime/index.cjs in ${path.relative(packDir, dependency.dir)}; rebuild it, or update AgentBuddy for built-in packs, then run \`abuddy build\` again`);
    }
    const seedsDir = path.join(dependency.dir, 'runtime', 'seeds');
    const runtime = await loadDependencyRuntime(packDir, depId, runtimeEntry, fs.existsSync(seedsDir) ? seedsDir : undefined);
    startTestRuntime({ entityTypes: Object.values(runtime.registration.ears?.entities ?? {}) });
    registry.registerPack(runtime.registration, originOf(dependency.manifest, dependency.dir));
  }
  startTestRuntime({ entityTypes: Object.values(registration.ears?.entities ?? {}) });
  registry.registerPack(registration, originOf(manifest, packDir));
  setAppPacks(registry, manifest.id);
}

export interface SeedPackOptions {
  /** Seed entries to seed; defaults to every entry naming a format without a pack seeder (actions and flows need the app) */
  keys?: string[];
  mode?: ImportMode;
}

/**
 * Compiles the pack's seed entries (with its own and its dependencies' formats) and seeds them into
 * the in-memory database, through the registered seed hooks. Returns each key's counts.
 */
export async function seedPack(options: SeedPackOptions = {}): Promise<Record<string, SeedCounts>> {
  if (!context) throw new Error('Call setupPackTests() from a vitest setup file before seedPack()');
  const { packDir, manifest, dependencies } = context;
  const resolved = resolveSeeds(manifest, packDir, dependencies);
  const keys = options.keys ?? Object.entries(resolved).filter(([, seed]) => seed.kind === 'format' && !seed.seeder).map(([key]) => key);
  const unknown = keys.filter((key) => !(key in resolved));
  if (unknown.length > 0) throw new Error(`No seed entries ${unknown.join(', ')} in abuddy.json`);

  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-pack-seeds-'));
  const { register, tsImport } = await import('tsx/esm/api');
  // The SDK's own compilers import TypeScript sources (flows, actions) that use the pack's #generated imports
  const unregister = register();
  try {
    await compilePack({
      packDir,
      outputDir,
      packConfig: { name: manifest.id, seeds: Object.fromEntries(keys.map((key) => [key, resolved[key]])) },
      // Flows validate against the registered steps (the pack's and its dependencies' runtimes)
      definitions: { steps: registry.steps(), artifacts: registry.artifacts(), blocks: registry.blocks() },
      importModule: (file) => tsImport(file, import.meta.url) as Promise<Record<string, unknown>>,
      log: () => {},
    });
    // Registered seeders whose key wasn't compiled find no seed file and skip
    const index = JSON.parse(fs.readFileSync(path.join(outputDir, SEED_INDEX_FILE), 'utf-8')) as SeedIndex;
    const seeded = new Set(index.seeds.filter((seed) => seed.seeded).map((seed) => seed.key));
    const result = seedData({ compiledDir: outputDir, mode: options.mode });
    return Object.fromEntries(Object.entries(result).filter(([key]) => seeded.has(key)));
  } finally {
    await unregister();
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
}

/**
 * Compiles flow DSL and imports it as the flow seeder does (the SDK's flow repository): steps name actions and
 * prompts and flows already in the database, and a flow marked `root: true` is the root flow the brain runs when the app starts.
 * Import before `startApp`. In the app, other flows run as subflows the root flow spawns:
 *
 *   importFlows({ 'Root Flow': { root: true, tracks: [entry([subflow('Memo Flow')], [keepAlive()])] } });
 */
export function importFlows(dsl: FlowDSL): void {
  const byLabel = (rows: Array<{ id: string; label?: string }>) => new Map(rows.map((row) => [String(row.label), row.id]));
  const flows = byLabel(untypedQx('Flow' as never).pickAll() as Array<{ id: string; label?: string }>);
  flowRepository.importFromDSL(compileFlowDSL(dsl, { actions: byLabel(actionRepository.all()), prompts: byLabel(promptRepository.all()), flows }));
}
