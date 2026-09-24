import * as fs from 'fs';
import * as path from 'path';
import type { EARS } from '../types/index.ts';
import { boundHost } from '../runtime/host-runtime.ts';

export interface ImportCounts {
  created: number;
  updated: number;
  skipped: number;
  /** Items that could not be seeded (e.g. flows failing validation). Non-empty means the seed failed. */
  errors?: string[];
}

export type SeedIncludeSet = true | ReadonlySet<string>;

export type ImportMode = 'keep-existing' | 'replace-on-collision' | 'wipe-and-replace';

export interface ImportContext {
  compiledDir: string;
  include?: SeedIncludeSet;
  mode?: ImportMode;
  log: (...args: unknown[]) => void;
}

export interface Seeder {
  key: string;
  apply(ctx: ImportContext): ImportCounts;
}

/** The seed keys a registered pack has seeders for (its registration's `seeders`): the only keys an import of its seeds can touch */
export function registeredSeedKeys(packId: string): string[] {
  return boundHost().packs.seeders(packId).map((seeder) => seeder.key);
}

/** The index compilePack writes next to a pack's compiled seeds */
export const SEED_INDEX_FILE = 'seeds.json';

/**
 * The pack that compiled a seeds directory, from its seeds.json. Seed keys start with it, so two
 * packs' records with the same entry key and identity seed a row each.
 */
export function seedPackId(compiledDir: string): string {
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

/** Seeds a pack's compiled seeds directory with the seeders of the registered pack its seeds.json names */
export function importCompiledSeeds(options: {
  compiledDir: string;
  include?: Record<string, SeedIncludeSet | undefined>;
  mode?: ImportMode;
  verbose?: boolean;
}): Record<string, ImportCounts> {
  const log = options.verbose ? console.log.bind(console) : () => {};
  const result: Record<string, ImportCounts> = {};
  const packId = seedPackId(options.compiledDir);

  for (const seeder of boundHost().packs.seeders(packId)) {
    const inc = options.include?.[seeder.key];
    if (inc instanceof Set && inc.size === 0) {
      log(`  ${seeder.key} section skipped by include filter`);
      result[seeder.key] = { created: 0, updated: 0, skipped: 0 };
      continue;
    }
    result[seeder.key] = seeder.apply({
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

export function shouldImportAll(inc: SeedIncludeSet | undefined): boolean {
  return inc === undefined || inc === true;
}

export function filterByInclude<T>(items: T[], getKey: (item: T) => string, inc: SeedIncludeSet | undefined): T[] {
  if (shouldImportAll(inc)) return items;
  const set = inc as ReadonlySet<string>;
  return items.filter(item => set.has(getKey(item)));
}
