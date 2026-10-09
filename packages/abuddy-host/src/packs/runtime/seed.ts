import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { createLogger } from '@abuddy/sdk/logger';
import { PACK_LAYOUT, packSeedFiles } from '../layout.ts';
import { recordSeedOutcomes } from '../installed.ts';
import type { PackManifest } from '@abuddy/sdk/build';
import { appliedContent, appState } from '../../app-state/index.ts';
import { importCompiledSeeds, type AppliedItem } from '@abuddy/sdk/utils';
import { errorMessage } from '@abuddy/sdk/utils/pure';

const logger = createLogger('pack-seed');

/**
 * What a pack's compiled seeds are: their bytes, and the names of the files holding them. **Content only.**
 *
 * The names as well as the bytes, so a seed moved between files, added or dropped counts — the same reason
 * `fingerprintUnit` hashes a unit's declared paths beside its contents.
 *
 * **File times are deliberately not in here, and used to be.** `placePack` copies into a fresh directory and
 * renames it over the old one, so every install leaves new files whatever they contain; hashing their mtimes
 * made a reinstall of the identical pack look like changed data, which was the point — reinstalling was how
 * you got a pack's data put back. It also made a `touch` re-seed, and made every `abuddy run` backend rebuild
 * re-import every seed, since that loop reinstalls. Content is what "changed" means here, as it does
 * everywhere else in this repo that compares a tree against a record.
 *
 * Putting a pack's data back on purpose is `IMPORT_PACK_SEEDS` (`features/packs/be/types.ts`), which Settings
 * drives with a preview, a per-key selection and a collision mode — more than a reinstall ever gave, and it
 * leaves this record alone, so asking for the data again does not change what counts as changed.
 */
export function computePackSeedHash(seedsDir: string): string {
  const files = packSeedFiles(seedsDir);
  if (files.length === 0) return '';
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    hash.update(file);
    hash.update(fs.readFileSync(path.join(seedsDir, file)));
  }
  return hash.digest('hex').slice(0, 16);
}

export interface PackImportFailure {
  packId: string;
  errors: string[];
}

function importErrors(result: Record<string, { errors?: string[] }> | undefined): string[] {
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
  /** The pack's own directory; its compiled seeds are at `runtime/seeds` under it */
  dir: string;
}

/**
 * The seed state of the packs `dependencies` names, as one string.
 *
 * A pack's own hash says whether its data changed. This says whether anything it depends on has seeded
 * since — the other thing that can turn a failed seed into one that would now succeed. A dependency that
 * has never seeded reads the same as one with nothing to seed, which is what the deferred note in
 * `docs/archive/goals/goal-pack-seed-order-and-retry.md` is about.
 */
function dependencyState(dependencies: Record<string, string> | undefined, seeded: Record<string, string>): string {
  return Object.keys(dependencies ?? {}).sort().map((id) => `${id}:${seeded[id] ?? ''}`).join('|');
}

/**
 * Seed the packs whose seed could have a different outcome than last time: their compiled data changed, or
 * their last seed failed and something they depend on has seeded since. `packs` arrives in dependency order
 * (`packSeedOrder`), so a pack sees what the packs it depends on seeded in this same run.
 *
 * **Every pack, by one rule**, whoever ships it: one hash over the files in its seeds directory, one record
 * (`AppState.packSeedHashes`) and one retry rule. Which
 * directory that is follows from where the pack lives, so a pack does not tell the host
 * where its compiled data is — the host knows, because it is the host that put the pack there.
 *
 * A pack whose seed reports errors (an invalid flow, say) is a failed seed: the error is recorded as the
 * installed-packs entry's `lastError`, and its hash is stored like a successful seed's, so the same failing
 * data isn't re-imported on every boot. What is stored alongside it is the state its dependencies were in,
 * so the retry happens when that changes rather than never.
 */
export function seedPacks(packs: Iterable<PackSeedTarget>, importSeeds: typeof importCompiledSeeds = importCompiledSeeds): PackImportFailure[] {
  const failures: PackImportFailure[] = [];
  const outcomes = new Map<string, string | undefined>();

  for (const pack of packs) {
    const packId = pack.manifest.id;
    const seedsDir = path.join(pack.dir, PACK_LAYOUT.seedsDir);
    const currentHash = fs.existsSync(seedsDir) ? computePackSeedHash(seedsDir) : '';
    if (!currentHash) {
      // Nothing to seed: an earlier version's error no longer applies, and neither does what it faced
      outcomes.set(packId, undefined);
      appState.updatePackEntry('packSeedDeps', packId, undefined);
      continue;
    }

    // Read per pack, not once: a pack earlier in this run may be one this pack depends on
    const state = appState.get();
    const deps = dependencyState(pack.manifest.dependencies, state.packSeedHashes);
    const failedAgainst = state.packSeedDeps[packId];
    if (state.packSeedHashes[packId] === currentHash && (failedAgainst === undefined || failedAgainst === deps)) {
      logger.info(`Pack seed skipped (unchanged): ${packId}`);
      continue;
    }

    logger.info(`Importing seeds for pack: ${packId}`);
    let errors: string[];
    // The keys this pack's content defined when it last seeded, and a set for the ones it defines now. Boot
    // seeding is the only import that carries them, which is what makes a row it cannot find the user's
    // deletion rather than a request for the data back (`removedByUser`, the SDK's `seed/seeder.ts`)
    const keyRecord = { before: new Set(state.packSeedKeys[packId] ?? []), defined: new Set<string>() };
    // What this run writes, by content key; `appliedContent.record` keeps the entry of every item it leaves
    // alone, since the entity still holds what the last run wrote
    const applied = new Map<string, AppliedItem>();
    try {
      // `replace-on-collision` is what the seeders do by default — they branch only on `keep-existing` and
      // `wipe-and-replace` — so naming it changes nothing and says what this is
      errors = importErrors(importSeeds({
        compiledDir: seedsDir,
        mode: 'replace-on-collision',
        keyRecord,
        applied,
      }));
    } catch (err) {
      errors = [errorMessage(err)];
    }
    appState.updatePackEntry('packSeedHashes', packId, currentHash);
    /**
     * **Recorded whether or not the run succeeded, because what it wrote is written either way.** A run that
     * imported fifty items and failed on the next has changed fifty entities, and `packSeedHashes` above has
     * already moved — so nothing re-imports them until the content changes again, and leaving them out would
     * make a later apply read all fifty as the user's. `packSeedKeys` is the opposite case below: a failed
     * run's set of defined keys is incomplete, so recording it would read as the pack having dropped every
     * key the run never reached.
     */
    appliedContent.record(packId, { revision: currentHash, wrote: applied });
    if (errors.length > 0) {
      logger.error(`Failed to seed pack ${packId}:\n  ${errors.join('\n  ')}`);
      appState.updatePackEntry('packSeedDeps', packId, deps);
      failures.push({ packId, errors });
      outcomes.set(packId, errors.join('\n'));
      continue;
    }
    appState.updatePackEntry('packSeedDeps', packId, undefined);
    // After a clean run, and as what this run defined rather than merged with it: a key the content dropped
    // stops being recorded, and a row a failed run never created is not remembered as one the user deleted
    appState.updatePackEntry('packSeedKeys', packId, [...keyRecord.defined]);
    outcomes.set(packId, undefined);
    logger.info(`Pack seeded: ${packId}`);
  }

  recordSeedOutcomes(outcomes);
  return failures;
}

