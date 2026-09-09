import * as fs from 'fs';
import * as path from 'path';
import type { EARS } from '../types';

export interface SeedCounts {
  created: number;
  updated: number;
  skipped: number;
}

export type SeedIncludeSet = true | ReadonlySet<string>;

export type ImportMode = 'keep-existing' | 'replace-on-collision' | 'wipe-and-replace';

export interface SeederContext {
  compiledDir: string;
  include?: SeedIncludeSet;
  mode?: ImportMode;
  log: (...args: any[]) => void;
}

export interface Seeder {
  key: string;
  seed(ctx: SeederContext): SeedCounts;
}

const seeders: Seeder[] = [];

export function registerSeeder(seeder: Seeder): void {
  if (seeders.some(s => s.key === seeder.key)) {
    console.warn(`[seed] Duplicate seeder key "${seeder.key}", skipping`);
    return;
  }
  seeders.push(seeder);
}

export function seedData(options: {
  compiledDir: string;
  include?: Record<string, SeedIncludeSet | undefined>;
  mode?: ImportMode;
  verbose?: boolean;
}): Record<string, SeedCounts> {
  const log = options.verbose ? console.log.bind(console) : () => {};
  const result: Record<string, SeedCounts> = {};

  for (const seeder of seeders) {
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
  log: (...args: any[]) => void;
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
