import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { createLogger } from '@/core/shared/debug/logger';
import type { LoadedPack } from './pack-loader';
import { resolvePackSeedsDir } from '@abuddy/sdk/packs';
import type { PackSeedManifest } from '@abuddy/sdk/framework';
import { seedPath } from '@abuddy/sdk/build';
import { repository } from '@abuddy/sdk/ears';
import { seedData, type SeedIncludeSet } from '@abuddy/sdk/utils';

const logger = createLogger('pack-seed');

function statFingerprint(files: { path: string }[]): string {
  const parts: string[] = [];
  for (const f of files) {
    try {
      const s = fs.statSync(f.path);
      parts.push(`${f.path}:${s.mtimeMs}:${s.size}`);
    } catch {
      parts.push(`${f.path}:missing`);
    }
  }
  return parts.join('|');
}

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
  options?: { cleanupStaleHashes?: boolean },
): void {
  const storedHashes = getStoredHashes();
  const updatedHashes = { ...storedHashes };
  let anySeeded = false;

  for (const pack of packs) {
    const distDir = resolvePackSeedsDir(pack.dir);
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

  if (options?.cleanupStaleHashes) {
    const installedIds = new Set(packs.map(p => p.manifest.id));
    for (const id of Object.keys(updatedHashes)) {
      if (!installedIds.has(id)) delete updatedHashes[id];
    }
  }

  if (anySeeded || Object.keys(updatedHashes).length !== Object.keys(storedHashes).length) {
    setStoredHashes(updatedHashes);
  }
}

function computeManifestSeedHash(compiledDir: string, artifacts: string[]): string {
  const hash = crypto.createHash('sha256');
  for (const name of artifacts) {
    const filePath = seedPath(compiledDir, name);
    if (fs.existsSync(filePath)) hash.update(fs.readFileSync(filePath));
  }
  return hash.digest('hex').slice(0, 16);
}

function evaluateSeedPolicy(policy?: PackSeedManifest['seedPolicy']): Record<string, SeedIncludeSet> {
  if (!policy) return {};
  const include: Record<string, SeedIncludeSet> = {};
  const repo = repository as any;

  for (const key of policy.skipAtBoot ?? []) {
    include[key] = new Set();
  }

  if (policy.skipAfterOnboarding?.length) {
    const hasOnboarded = repo.settingsQueries.getInternalSettings().hasOnboarded;
    if (hasOnboarded) {
      for (const key of policy.skipAfterOnboarding) {
        include[key] = new Set();
      }
    }
  }

  return include;
}

export function orchestrateDeclarativeSeed(manifest: PackSeedManifest): void {
  const { artifacts, compiledDir, seedPolicy } = manifest;
  const repo = repository as any;
  const internal = repo.settingsQueries.getInternalSettings();
  const storedHash = internal.seedHash;

  // Fast path: if file mtimes/sizes haven't changed, the hash is the same
  const seedFiles = artifacts.map(name => ({ path: seedPath(compiledDir, name) }));
  const fp = statFingerprint(seedFiles);
  const storedFp = internal.seedStatFingerprint;
  if (storedHash && storedFp === fp) {
    logger.info('Boot seed skipped: files unchanged (mtime)');
    return;
  }

  const currentHash = computeManifestSeedHash(compiledDir, artifacts);
  if (storedHash === currentHash) {
    repo.settingsCommands.updateSettings('internal', null, ['seedStatFingerprint'], fp);
    logger.info('Boot seed skipped: data unchanged');
    return;
  }

  const include = evaluateSeedPolicy(seedPolicy);
  seedData({ compiledDir, include });
  repo.settingsCommands.updateSettings('internal', null, ['seedHash'], currentHash);
  repo.settingsCommands.updateSettings('internal', null, ['seedStatFingerprint'], fp);
  logger.info('Boot seed completed');
}
