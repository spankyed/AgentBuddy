import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { createLogger } from '@abuddy/sdk/logger';
import { PACK_LAYOUT } from '../pack-layout.ts';
import { addInstalledPack, updateInstalledPacks } from '../installed-packs.ts';
import type { LoadedPack } from './loaded-packs.ts';
import type { PackSeedManifest } from '@abuddy/sdk/framework';
import { seedPath } from '@abuddy/sdk/build';
import { appState } from '../../app-state/index.ts';
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

export interface PackSeedFailure {
  packId: string;
  errors: string[];
}

function seedErrors(result: Record<string, { errors?: string[] }> | undefined): string[] {
  return Object.entries(result ?? {}).flatMap(([key, counts]) => (counts?.errors ?? []).map(e => `${key}: ${e}`));
}

/**
 * Records what each seeded pack's seed came to.
 *
 * A row appears only when there is something to say: a pack that seeded cleanly and has no row keeps
 * none, and one whose row carries an error from before has it cleared.
 */
function recordSeedOutcome(outcomes: Map<string, string | undefined>): void {
  if (outcomes.size === 0) return;
  try {
    updateInstalledPacks(entries => {
      let next = entries;
      for (const [packId, lastError] of outcomes) {
        const existing = next.find(e => e.id === packId);
        if (!lastError) {
          if (existing?.lastError) {
            const { lastError: _cleared, ...rest } = existing;
            next = addInstalledPack(next, rest);
          }
          continue;
        }
        next = addInstalledPack(next, { ...(existing ?? { id: packId, enabled: true }), lastError });
      }
      return next;
    });
  } catch (err) {
    logger.warn('Failed to record pack seed outcome in the registry:', err as Error);
  }
}

/**
 * Seed external packs whose compiled data changed. A pack whose seed reports errors
 * (e.g. an invalid flow) is a failed seed: the error is recorded as the installed-packs entry's
 * lastError. Its hash is stored like a successful seed's, so the same failing data isn't
 * re-imported on every boot; it's retried when the pack's seed data changes.
 */
export function seedPackData(packs: LoadedPack[], seed: typeof seedData = seedData): PackSeedFailure[] {
  const storedHashes = appState.get().packSeedHashes;
  const failures: PackSeedFailure[] = [];
  const outcomes = new Map<string, string | undefined>();

  for (const pack of packs) {
    const packId = pack.manifest.id;
    const distDir = path.join(pack.dir, PACK_LAYOUT.seedsDir);
    const currentHash = fs.existsSync(distDir) ? computePackSeedHash(distDir) : '';
    if (!currentHash) {
      // Nothing to seed: an error from an earlier version's seed no longer applies
      outcomes.set(packId, undefined);
      continue;
    }

    if (storedHashes[packId] === currentHash) {
      logger.info(`Pack seed skipped (unchanged): ${packId}`);
      continue;
    }

    logger.info(`Seeding data for pack: ${packId}`);
    let errors: string[];
    try {
      errors = seedErrors(seed({ compiledDir: distDir, mode: 'replace-on-collision' }));
    } catch (err) {
      errors = [err instanceof Error ? err.message : String(err)];
    }
    appState.updatePackEntry('packSeedHashes', packId, currentHash);
    if (errors.length > 0) {
      logger.error(`Failed to seed pack ${packId}:\n  ${errors.join('\n  ')}`);
      failures.push({ packId, errors });
      outcomes.set(packId, errors.join('\n'));
      continue;
    }
    outcomes.set(packId, undefined);
    logger.info(`Pack seeded: ${packId}`);
  }

  recordSeedOutcome(outcomes);
  return failures;
}

function computeManifestSeedHash(compiledDir: string, seedKeys: string[]): string {
  const hash = crypto.createHash('sha256');
  for (const name of seedKeys) {
    const filePath = seedPath(compiledDir, name);
    if (fs.existsSync(filePath)) hash.update(fs.readFileSync(filePath));
  }
  return hash.digest('hex').slice(0, 16);
}

function evaluateSeedPolicy(policy?: PackSeedManifest['seedPolicy']): Record<string, SeedIncludeSet> {
  if (!policy) return {};
  const include: Record<string, SeedIncludeSet> = {};

  for (const key of policy.skipAtBoot ?? []) {
    include[key] = new Set();
  }

  if (policy.skipAfterOnboarding?.length) {
    if (appState.get().hasOnboarded) {
      for (const key of policy.skipAfterOnboarding) {
        include[key] = new Set();
      }
    }
  }

  return include;
}

/**
 * Seeds a built-in pack's declared boot seed, skipping it when its compiled data hasn't changed since
 * the last run. What was last seeded is recorded per pack: every built-in pack with a `boot.seed` runs
 * through here, so one shared hash would have each pack overwriting the others' and re-seeding forever.
 */
export function orchestrateDeclarativeSeed(manifest: PackSeedManifest, packId: string): void {
  const { seedKeys, compiledDir, seedPolicy } = manifest;
  const stored = appState.get();
  const storedHash = stored.seedHashes[packId];

  // Fast path: if file mtimes/sizes haven't changed, the hash is the same
  const seedFiles = seedKeys.map(name => ({ path: seedPath(compiledDir, name) }));
  const fp = statFingerprint(seedFiles);
  const storedFp = stored.seedStatFingerprints[packId];
  if (storedHash && storedFp === fp) {
    logger.info(`Boot seed skipped for ${packId}: files unchanged (mtime)`);
    return;
  }

  const record = (field: 'seedHashes' | 'seedStatFingerprints', value: string) => appState.updatePackEntry(field, packId, value);

  const currentHash = computeManifestSeedHash(compiledDir, seedKeys);
  if (storedHash === currentHash) {
    record('seedStatFingerprints', fp);
    logger.info(`Boot seed skipped for ${packId}: data unchanged`);
    return;
  }

  const include = evaluateSeedPolicy(seedPolicy);
  const counts = seedData({ compiledDir, include });
  // Seeders report a record they couldn't seed (an invalid flow, say) in its counts rather than throwing
  const errors = seedErrors(counts);

  // Stored even when records failed, as seedPackData does: the same failing data isn't re-imported on
  // every boot, and it's retried as soon as the compiled seeds change
  record('seedHashes', currentHash);
  record('seedStatFingerprints', fp);

  if (errors.length > 0) {
    logger.error(`Boot seed for ${packId} finished with errors; those records were not seeded and won't be retried until the compiled seeds change:\n  ${errors.join('\n  ')}`);
    return;
  }
  logger.info(`Boot seed completed for ${packId}: ${JSON.stringify(counts)}`);
}
