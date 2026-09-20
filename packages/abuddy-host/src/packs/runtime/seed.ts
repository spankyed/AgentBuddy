import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { createLogger } from '@abuddy/sdk/logger';
import { PACK_LAYOUT } from '../pack-layout.ts';
import { recordSeedOutcomes } from '../installed-packs.ts';
import type { PackSeedManifest } from '@abuddy/sdk/framework';
import { seedPath, type PackManifest } from '@abuddy/sdk/build';
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
 * What seeding a pack needs: which pack, where its compiled seeds are, and what it depends on.
 *
 * The manifest fields are `Pick`ed from `PackManifest` rather than restated, so this can't drift from what
 * a manifest actually holds — `dependencies` is optional here because a pack with none declares none, not
 * because a caller may leave it out. It is what the retry rule reads: a seed that failed is run again once
 * one of these has seeded.
 */
export interface PackSeedTarget {
  manifest: Pick<PackManifest, 'id' | 'dependencies'>;
  dir: string;
}

/**
 * The seed state of the packs `dependencies` names, as one string.
 *
 * A pack's own hash says whether its data changed. This says whether anything it depends on has seeded
 * since — the other thing that can turn a failed seed into one that would now succeed. A dependency that
 * has never seeded reads the same as one with nothing to seed, which is what the deferred note in
 * `goal-pack-seed-order-and-retry.md` is about.
 */
function dependencyState(dependencies: Record<string, string> | undefined, seeded: Record<string, string>): string {
  return Object.keys(dependencies ?? {}).sort().map((id) => `${id}:${seeded[id] ?? ''}`).join('|');
}

/**
 * Seed the external packs whose seed could have a different outcome than last time: their compiled data
 * changed, or their last seed failed and something they depend on has seeded since. `packs` arrives in
 * dependency order (`packSeedOrder`), so a pack sees what the packs it depends on seeded in this same run.
 *
 * A pack whose seed reports errors (an invalid flow, say) is a failed seed: the error is recorded as the
 * installed-packs entry's `lastError`, and its hash is stored like a successful seed's, so the same failing
 * data isn't re-imported on every boot. What is stored alongside it is the state its dependencies were in,
 * so the retry happens when that changes rather than never.
 */
export function seedPackData(packs: Iterable<PackSeedTarget>, seed: typeof seedData = seedData): PackSeedFailure[] {
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

    // Read per pack, not once: a pack earlier in this run may be one this pack depends on
    const state = appState.get();
    // Built-in packs' hashes too — a dependency may be one of them, and they seed before any of these
    const deps = dependencyState(pack.manifest.dependencies, { ...state.seedHashes, ...state.packSeedHashes });
    const failedAgainst = state.packSeedDeps[packId];
    if (state.packSeedHashes[packId] === currentHash && (failedAgainst === undefined || failedAgainst === deps)) {
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
      appState.updatePackEntry('packSeedDeps', packId, deps);
      failures.push({ packId, errors });
      outcomes.set(packId, errors.join('\n'));
      continue;
    }
    appState.updatePackEntry('packSeedDeps', packId, undefined);
    outcomes.set(packId, undefined);
    logger.info(`Pack seeded: ${packId}`);
  }

  recordSeedOutcomes(outcomes);
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
