import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { createLogger } from '@/core/shared/debug/logger';
import type { LoadedPack } from './pack-loader';

const logger = createLogger('pack-seed');

export function computePackSeedHash(distDir: string): string {
  const files = fs.readdirSync(distDir).filter(f => f.endsWith('.json')).sort();
  if (files.length === 0) return '';
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    hash.update(file);
    hash.update(fs.readFileSync(path.join(distDir, file)));
  }
  return hash.digest('hex').slice(0, 16);
}

export function seedPackData(
  packs: LoadedPack[],
  seedFn: (options: { compiledDir: string; mode?: any; verbose?: boolean }) => Record<string, any>,
  getStoredHashes: () => Record<string, string>,
  setStoredHashes: (hashes: Record<string, string>) => void,
): void {
  const storedHashes = getStoredHashes();
  const updatedHashes = { ...storedHashes };
  let anySeeded = false;

  for (const pack of packs) {
    const distDir = path.join(pack.dir, 'dist');
    if (!fs.existsSync(distDir)) continue;

    const currentHash = computePackSeedHash(distDir);
    if (!currentHash) continue;

    if (storedHashes[pack.manifest.id] === currentHash) {
      logger.info(`Pack seed skipped (unchanged): ${pack.manifest.id}`);
      continue;
    }

    logger.info(`Seeding data artifacts for pack: ${pack.manifest.id}`);
    try {
      seedFn({ compiledDir: distDir, mode: 'replace-on-collision' });
      updatedHashes[pack.manifest.id] = currentHash;
      anySeeded = true;
      logger.info(`Pack seeded: ${pack.manifest.id}`);
    } catch (err) {
      logger.error(`Failed to seed pack ${pack.manifest.id}:`, err as Error);
    }
  }

  const installedIds = new Set(packs.map(p => p.manifest.id));
  for (const id of Object.keys(updatedHashes)) {
    if (!installedIds.has(id)) delete updatedHashes[id];
  }

  if (anySeeded || Object.keys(updatedHashes).length !== Object.keys(storedHashes).length) {
    setStoredHashes(updatedHashes);
  }
}
