import * as fs from 'node:fs';
import * as path from 'node:path';
import { SEED_INDEX_FILE, type SeedIndex } from '../build/seed-compiler.ts';
import type { PackSeedsPreview } from '../build/preview.ts';

export type { PackSeedsPreview, PackSeedPreviewItem } from '../build/preview.ts';

/** What a compiled seeds directory would import: its seeded keys and their items, from seeds.json */
export function previewPackSeeds(directory: string): PackSeedsPreview {
  const indexFile = path.join(directory, SEED_INDEX_FILE);
  if (!fs.existsSync(indexFile)) {
    throw new Error(`${directory} has no ${SEED_INDEX_FILE}: choose a pack's compiled seeds directory (built by abuddy build)`);
  }
  const index = JSON.parse(fs.readFileSync(indexFile, 'utf-8')) as SeedIndex;
  if (!index.packId) {
    throw new Error(`${indexFile} doesn't name the pack that compiled these seeds: rebuild the pack with abuddy build`);
  }
  return {
    directory,
    packId: index.packId,
    seeds: Object.fromEntries(index.seeds.filter((entry) => entry.seeded).map((entry) => [entry.key, entry.items])),
  };
}
