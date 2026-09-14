// Unit tests for a pack's data code, without the app: the pack's seeds, repositories and seed hooks
// against an in-memory EARS, with its dependencies' seeding behaviour (their seed runtimes). It runs
// on the pack's own @abuddy/sdk, so registrations are the ones the pack's code sees.
//
//   // tests/setup.ts (vitest setupFiles, after isolatedDataDir's)
//   import '#generated/seeders';
//   import { seedRuntime } from '#generated/seed-runtime';
//   import { setupPackTests } from '@abuddy/testing/harness';
//   await setupPackTests({ seedRuntime });
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeEach } from 'vitest';
import { registerSeedRuntime, resetTestData, startTestRuntime, type SeedRuntime } from '@abuddy/sdk/testing';
import { compilePack, resolveSeeds, SEED_INDEX_FILE, type PackManifest, type PackSnapshot, type SeedDependency, type SeedIndex } from '@abuddy/sdk/build';
import { getMediaPath, seedData, type ImportMode, type SeedCounts } from '@abuddy/sdk/utils';

export { resetTestData, type SeedRuntime };

/** Where `abuddy build` caches a dependency's snapshot and build/ in a pack */
const DEPS_DIR = path.join('.abuddy', 'deps');
const SEED_RUNTIME_FILE = 'seed-runtime.mjs';

export interface PackTestOptions {
  /** The pack's own seed runtime: `import { seedRuntime } from '#generated/seed-runtime'` */
  seedRuntime: SeedRuntime;
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

function readDependencies(packDir: string, manifest: PackManifest): Map<string, SeedDependency & { snapshot: PackSnapshot }> {
  const dependencies = new Map<string, SeedDependency & { snapshot: PackSnapshot }>();
  for (const depId of Object.keys(manifest.dependencies ?? {})) {
    const dir = path.join(packDir, DEPS_DIR, depId);
    const snapshotFile = path.join(dir, 'snapshot.json');
    if (!fs.existsSync(snapshotFile)) {
      throw new Error(`Dependency "${depId}" isn't in ${path.join(DEPS_DIR, depId)}. Run \`abuddy build\` once to fetch dependencies.`);
    }
    const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf-8')) as PackSnapshot;
    const buildDir = path.join(dir, 'build');
    dependencies.set(depId, { snapshot, manifest: snapshot.manifest, ...(fs.existsSync(buildDir) && { buildDir }) });
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
  for (const [depId, dependency] of dependencies) {
    const file = dependency.buildDir && path.join(dependency.buildDir, SEED_RUNTIME_FILE);
    if (!file || !fs.existsSync(file)) {
      throw new Error(`Dependency "${depId}" has no ${SEED_RUNTIME_FILE}; rebuild it, or update AgentBuddy for built-in packs, then run \`abuddy build\` again`);
    }
    const { seedRuntime } = await import(pathToFileURL(file).href) as { seedRuntime: SeedRuntime };
    registerSeedRuntime(seedRuntime);
  }
  registerSeedRuntime(options.seedRuntime);

  context = { packDir, manifest, dependencies };
  beforeEach(() => {
    resetTestData();
    fs.rmSync(getMediaPath(), { recursive: true, force: true });
  });
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
