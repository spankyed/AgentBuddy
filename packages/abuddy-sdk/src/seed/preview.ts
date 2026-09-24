import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SeedIndex } from '../build/seed-compiler.ts';
import type { PackSeedsPreview } from '../build/preview.ts';
import { indexPackId, registeredSeedKeys, SEED_INDEX_FILE } from '../utils/seed.ts';

export type { PackSeedsPreview, PackSeedPreviewItem } from '../build/preview.ts';

/**
 * What a compiled seeds directory would import: its seeded keys that the compiling pack registered
 * seeders for, and their items, from seeds.json. Throws when that pack registered no seeders (it
 * isn't installed), since importCompiledSeeds would import nothing.
 */
export function previewPackSeeds(directory: string): PackSeedsPreview {
  const indexFile = path.join(directory, SEED_INDEX_FILE);
  if (!fs.existsSync(indexFile)) {
    throw new Error(`${directory} has no ${SEED_INDEX_FILE}: choose a pack's compiled seeds directory (built by abuddy build)`);
  }
  const index = JSON.parse(fs.readFileSync(indexFile, 'utf-8')) as SeedIndex;
  const packId = indexPackId(index, indexFile);
  const registered = new Set(registeredSeedKeys(packId));
  if (registered.size === 0) {
    throw new Error(`Pack "${packId}" isn't installed, so its seeds can't be imported: install the pack first`);
  }
  const seeded = index.seeds.filter((entry) => entry.seeded);
  return {
    directory,
    packId,
    seeds: Object.fromEntries(seeded.filter((entry) => registered.has(entry.key)).map((entry) => [entry.key, entry.items])),
    unavailable: seeded.filter((entry) => !registered.has(entry.key)).map((entry) => entry.key),
  };
}
