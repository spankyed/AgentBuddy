// Unit tests for a pack without the app, on the pack's own @abuddy/sdk (registrations are the ones
// the pack's code sees). Two tiers:
// - data: the pack's seeds, repositories and seed hooks against an in-memory EARS, with its
//   dependencies' seeding behaviour (their seed runtimes);
// - runtime (with `registration`): also its systems, services and steps, and its dependencies' full
//   runtimes, run under the app's bus core with `startApp`.
//
//   // tests/setup.ts (vitest setupFiles, after isolatedDataDir's)
//   import '#generated/seeders';
//   import { seedRuntime } from '#generated/seed-runtime';
//   import { registration } from '#generated/pack-entry';
//   import { setupPackTests } from '@abuddy/testing/harness';
//   await setupPackTests({ seedRuntime, registration });
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach } from 'vitest';
import { registerSeedRuntime, resetTestData, restoreModelProvider, startTestRuntime, takeSystemErrors, type SeedRuntime } from '@abuddy/sdk/testing';
import { registerHostModule, getHostModule } from '@abuddy/sdk/runtime';
import type { PackRegistration } from '@abuddy/sdk/framework';
import * as hostPacks from '@abuddy/host/packs';
import { loadDependencyRuntime } from './dependency-runtime.ts';
import { setAppPackId, stopRunningApps } from './app.ts';
import { compilePack, resolveSeeds, SEED_INDEX_FILE, type PackManifest, type PackSnapshot, type SeedDependency, type SeedIndex } from '@abuddy/sdk/build';
import { getMediaPath, seedData, type ImportMode, type SeedCounts } from '@abuddy/sdk/utils';

export { resetTestData, takeSystemErrors, type SeedRuntime };
export { startApp, type StartAppOptions, type TestApp, type OutgoingSystemEvents } from './app.ts';

const serviceMocks = new Map<string, unknown>();

/** The pack registry `services` reads, with the current test's mocked services over the registered ones */
const packRegistryWithMocks = {
  ...hostPacks,
  getRegisteredServices: () => ({ ...hostPacks.getRegisteredServices(), ...Object.fromEntries(serviceMocks) }),
};

/**
 * Replaces a service in `services` for the current test, restored after it. Type it with the pack's
 * services (`mockService<Services>('llm', { generateText: … })`); give only the members the code
 * under test uses. Code that imports a service module directly instead of using `services` isn't
 * affected.
 */
export function mockService<S extends object = Record<string, object>, K extends keyof S & string = keyof S & string>(name: K, implementation: Partial<S[K]>): void {
  serviceMocks.set(name, implementation);
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
  /** The pack root (with abuddy.json); defaults to the nearest one above the working directory */
  packDir?: string;
}

interface PackContext {
  packDir: string;
  manifest: PackManifest;
  dependencies: Map<string, SeedDependency>;
}

let context: PackContext | undefined;

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
    const buildDir = path.join(dir, 'build');
    dependencies.set(depId, { snapshot, dir, manifest: snapshot.manifest, ...(fs.existsSync(buildDir) && { buildDir }) });
  }
  return dependencies;
}

/**
 * Starts the in-memory runtime for the pack's tests: entity types of the SDK, the pack and its
 * dependencies; each dependency's seed runtime (its repositories and seed hooks) and the pack's own
 * registered; the database emptied before each test. Call it once, from a vitest setup file.
 */
export async function setupPackTests(options: PackTestOptions): Promise<void> {
  if (!process.env.ABUDDY_USER_DATA_DIR) {
    throw new Error('ABUDDY_USER_DATA_DIR is unset: use isolatedDataDir() from @abuddy/testing/vitest in vitest.config.ts');
  }
  const packDir = options.packDir ?? findPackDir(process.cwd());
  const manifest = JSON.parse(fs.readFileSync(path.join(packDir, 'abuddy.json'), 'utf-8')) as PackManifest;
  const dependencies = readDependencies(packDir, manifest);

  startTestRuntime({ entityTypes: [...dependencies.values()].flatMap(({ snapshot }) => Object.values(snapshot.types.entities)) });
  try {
    getHostModule('pack-registry');
  } catch {
    registerHostModule('pack-registry', packRegistryWithMocks);
  }
  if (options.registration) {
    await registerRuntimes(packDir, manifest, dependencies, options.registration);
  } else {
    for (const [depId, dependency] of dependencies) {
      const file = dependency.buildDir && path.join(dependency.buildDir, SEED_RUNTIME_FILE);
      if (!file || !fs.existsSync(file)) {
        throw new Error(`Dependency "${depId}" has no ${SEED_RUNTIME_FILE}; rebuild it, or update AgentBuddy for built-in packs, then run \`abuddy build\` again`);
      }
      const { seedRuntime } = await import(pathToFileURL(file).href) as { seedRuntime: SeedRuntime };
      registerSeedRuntime(seedRuntime);
    }
  }
  registerSeedRuntime(options.seedRuntime);

  context = { packDir, manifest, dependencies };
  beforeEach(() => {
    resetTestData();
    fs.rmSync(getMediaPath(), { recursive: true, force: true });
  });
  afterEach(() => {
    stopRunningApps();
    serviceMocks.clear();
    restoreModelProvider();
    const errors = takeSystemErrors();
    if (errors.length > 0) {
      const described = errors.map((e) => `${e.source ?? 'unknown'}: ${e.error instanceof Error ? e.error.message : String(e.error)}`);
      throw new Error(`Systems reported errors the test didn't take (takeSystemErrors()):\n  ${described.join('\n  ')}`);
    }
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
    if (!hostPacks.getPackContributions(depId)) hostPacks.registerPack(runtime.registration);
  }
  startTestRuntime({ entityTypes: Object.values(registration.ears?.entities ?? {}) });
  if (!hostPacks.getPackContributions(registration.id)) hostPacks.registerPack(registration);
  setAppPackId(manifest.id);
}

export interface SeedPackOptions {
  /** Seed entries to seed; defaults to every entry naming a format (actions, flows and settings need the app) */
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
  const keys = options.keys ?? Object.entries(resolved).filter(([, seed]) => seed.kind === 'format').map(([key]) => key);
  const unknown = keys.filter((key) => !(key in resolved));
  if (unknown.length > 0) throw new Error(`No seed entries ${unknown.join(', ')} in abuddy.json`);

  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-pack-seeds-'));
  try {
    const { tsImport } = await import('tsx/esm/api');
    await compilePack({
      packDir,
      outputDir,
      packConfig: { name: manifest.id, seeds: Object.fromEntries(keys.map((key) => [key, resolved[key]])) },
      importModule: (file) => tsImport(file, import.meta.url) as Promise<Record<string, unknown>>,
      log: () => {},
    });
    // Registered seeders whose key wasn't compiled find no seed file and skip
    const index = JSON.parse(fs.readFileSync(path.join(outputDir, SEED_INDEX_FILE), 'utf-8')) as SeedIndex;
    const seeded = new Set(index.seeds.filter((seed) => seed.seeded).map((seed) => seed.key));
    const result = seedData({ compiledDir: outputDir, mode: options.mode });
    return Object.fromEntries(Object.entries(result).filter(([key]) => seeded.has(key)));
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
}
