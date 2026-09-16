import * as fs from 'fs';
import * as path from 'path';
import type { EARS } from '../types/index.ts';

export interface SeedCounts {
  created: number;
  updated: number;
  skipped: number;
  /** Items that could not be seeded (e.g. flows failing validation). Non-empty means the seed failed. */
  errors?: string[];
}

export type SeedIncludeSet = true | ReadonlySet<string>;

export type ImportMode = 'keep-existing' | 'replace-on-collision' | 'wipe-and-replace';

export interface SeederContext {
  compiledDir: string;
  include?: SeedIncludeSet;
  mode?: ImportMode;
  log: (...args: unknown[]) => void;
}

export interface Seeder {
  key: string;
  seed(ctx: SeederContext): SeedCounts;
}

/** Each pack's seeders: two packs may declare the same seed key with different seeders */
const packSeeders = new Map<string, Seeder[]>();

/** Registers a pack's seeders, replacing the ones it registered before (a reloaded pack's module registers again) */
export function registerSeeders(packId: string, seeders: Seeder[]): void {
  const keys = new Set<string>();
  for (const { key } of seeders) {
    if (keys.has(key)) throw new Error(`Pack "${packId}" registers two seeders for seed key "${key}"`);
    keys.add(key);
  }
  packSeeders.set(packId, seeders);
}

/**
 * Drops a pack's seeders when it's torn down
 *
 * @internal Host-only: pack teardown.
 */
export function unregisterSeeders(packId: string): void {
  packSeeders.delete(packId);
}

/** The seed keys a pack registered seeders for: the only keys an import of its seeds can seed */
export function registeredSeedKeys(packId: string): string[] {
  return (packSeeders.get(packId) ?? []).map((seeder) => seeder.key);
}

/** The index compilePack writes next to a pack's compiled seeds */
export const SEED_INDEX_FILE = 'seeds.json';

/**
 * The pack that compiled a seeds directory, from its seeds.json. Seed keys start with it, so two
 * packs' records with the same entry key and identity seed a row each.
 */
export function seedingPackId(compiledDir: string): string {
  const indexFile = path.join(compiledDir, SEED_INDEX_FILE);
  return indexPackId(loadJSON<{ packId?: string }>(indexFile), indexFile);
}

/** The pack a parsed seeds index names; an index from before packs were recorded names none */
export function indexPackId(index: { packId?: string } | null, indexFile: string): string {
  if (!index?.packId) {
    throw new Error(`${indexFile} doesn't name the pack that compiled these seeds: rebuild the pack with abuddy build`);
  }
  return index.packId;
}

/** Seeds a pack's compiled seeds directory with the seeders of the pack its seeds.json names */
export function seedData(options: {
  compiledDir: string;
  include?: Record<string, SeedIncludeSet | undefined>;
  mode?: ImportMode;
  verbose?: boolean;
}): Record<string, SeedCounts> {
  const log = options.verbose ? console.log.bind(console) : () => {};
  const result: Record<string, SeedCounts> = {};
  const packId = seedingPackId(options.compiledDir);

  for (const seeder of packSeeders.get(packId) ?? []) {
    const inc = options.include?.[seeder.key];
    if (inc instanceof Set && inc.size === 0) {
      log(`  ${seeder.key} section skipped by include filter`);
      result[seeder.key] = { created: 0, updated: 0, skipped: 0 };
      continue;
    }
    result[seeder.key] = seeder.seed({
      compiledDir: options.compiledDir,
      include: inc,
      mode: options.mode,
      log,
    });
  }

  return result;
}

// --- Helpers available to seeders ---

export function loadJSON<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch (err) {
    console.warn(`[seed] Failed to parse ${path.basename(filePath)}:`, (err as Error).message);
    return null;
  }
}

export function shouldSeedAll(inc: SeedIncludeSet | undefined): boolean {
  return inc === undefined || inc === true;
}

export function filterByInclude<T>(items: T[], getKey: (item: T) => string, inc: SeedIncludeSet | undefined): T[] {
  if (shouldSeedAll(inc)) return items;
  const set = inc as ReadonlySet<string>;
  return items.filter(item => set.has(getKey(item)));
}

function shouldSkipByHash(
  existingHash: string | undefined,
  compiledHash: string | undefined,
): 'untracked' | 'unchanged' | null {
  if (!existingHash) return 'untracked';
  if (compiledHash && existingHash === compiledHash) return 'unchanged';
  return null;
}

export function seedCollection<T>(opts: {
  file: string;
  label: string;
  getKey: (item: T) => string;
  findExisting: (item: T) => { id: EARS.EntityId } | undefined;
  create: (item: T) => void;
  update: (id: EARS.EntityId, item: T) => void;
  log: (...args: unknown[]) => void;
  include?: SeedIncludeSet;
  mode?: ImportMode;
  wipe?: () => void;
  getSourceHash?: (item: T) => string | undefined;
  getExistingSourceHash?: (existing: { id: EARS.EntityId }) => string | undefined;
}): SeedCounts {
  const counts: SeedCounts = { created: 0, updated: 0, skipped: 0 };
  const raw = loadJSON<T[]>(opts.file);
  if (!raw) {
    opts.log(`  ${opts.label} file not found, skipping`);
    return counts;
  }
  const data = filterByInclude(raw, opts.getKey, opts.include);
  if (data.length === 0 && !shouldSeedAll(opts.include)) {
    opts.log(`  ${opts.label} section skipped by include filter`);
    return counts;
  }
  if (opts.mode === 'wipe-and-replace' && opts.wipe) {
    opts.wipe();
    opts.log(`  ${opts.label} wiped`);
  }
  const hashAware = opts.getSourceHash && opts.getExistingSourceHash;
  for (const item of data) {
    const key = opts.getKey(item);
    const existing = opts.findExisting(item);
    if (existing) {
      if (opts.mode === 'keep-existing') {
        opts.log(`  ${opts.label} skipped (existing): ${key}`);
        counts.skipped++;
      } else if (hashAware) {
        const skip = shouldSkipByHash(opts.getExistingSourceHash!(existing), opts.getSourceHash!(item));
        if (skip) {
          opts.log(`  ${opts.label} ${skip}: ${key}`);
          counts.skipped++;
        } else {
          opts.update(existing.id, item);
          opts.log(`  ${opts.label} updated: ${key}`);
          counts.updated++;
        }
      } else {
        opts.update(existing.id, item);
        opts.log(`  ${opts.label} updated: ${key}`);
        counts.updated++;
      }
    } else {
      opts.create(item);
      opts.log(`  ${opts.label} created: ${key}`);
      counts.created++;
    }
  }
  return counts;
}
