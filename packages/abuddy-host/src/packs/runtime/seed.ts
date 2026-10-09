import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { createLogger } from '@abuddy/sdk/logger';
import { PACK_LAYOUT, packSeedFiles } from '../layout.ts';
import { recordSeedOutcomes } from '../installed.ts';
import type { PackManifest } from '@abuddy/sdk/build';
import { appliedContent, appState } from '../../app-state/index.ts';
import { applyRecord, importCompiledSeeds } from '@abuddy/sdk/utils';
import { describeContentKey } from '@abuddy/sdk/seed';
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
 * The applied state of the packs `dependencies` names, as one string.
 *
 * A pack's own revision says whether its data changed. This says whether anything it depends on has applied
 * since — the other thing that can turn a failed apply into one that would now succeed. A dependency that
 * has never applied reads the same as one with nothing to apply, which is what the deferred note in
 * `docs/archive/goals/goal-pack-seed-order-and-retry.md` is about.
 */
function dependencyState(dependencies: Record<string, string> | undefined): string {
  return Object.keys(dependencies ?? {}).sort().map((id) => `${id}:${appliedContent.get(id).revision}`).join('|');
}

/**
 * One line per item the user now has a decision about, so the freeze is visible before any UI draws it.
 *
 * Named rather than keyed, because a content key is `%5B%22Action%22...` and nobody reads that: the key
 * holds the entity type and the item's identity, and `describeContentKey` is what renders them. The keys
 * are in the event's meta for whoever is tracing one.
 *
 * **Boot seeding runs before the bus starts**, so this reaches stdout and the app's log file and not the
 * Logs plugin, which shows what `onLog` delivers from the moment the bus starts it. An apply on a reload
 * or an activation reaches both.
 */
function reportUnresolved(packId: string, kind: string, items: ReadonlyMap<string, string[]>): void {
  if (items.size === 0) return;
  const named = [...items].map(([key, parts]) => `${describeContentKey(key)} (${parts.join(', ')})`);
  logger.warn(`${items.size} of ${packId}'s items ${kind}:\n  ${named.join('\n  ')}`, {
    packId,
    items: Object.fromEntries(items),
  });
}

/**
 * Seed the packs whose seed could have a different outcome than last time: their compiled data changed, or
 * their last seed failed and something they depend on has seeded since. `packs` arrives in dependency order
 * (`packSeedOrder`), so a pack sees what the packs it depends on seeded in this same run.
 *
 * **Every pack, by one rule**, whoever ships it: one hash over the files in its seeds directory, one record
 * (`appliedContent`) and one retry rule. Which
 * directory that is follows from where the pack lives, so a pack does not tell the host
 * where its compiled data is — the host knows, because it is the host that put the pack there.
 *
 * A pack whose seed reports errors (an invalid flow, say) is a failed seed: the error is recorded as the
 * installed-packs entry's `lastError`, and its revision is recorded like a successful seed's, so the same
 * failing data isn't re-imported on every boot. What is stored alongside it is the state its dependencies were in,
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
    const applied = appliedContent.get(packId);
    const deps = dependencyState(pack.manifest.dependencies);
    const failedAgainst = appState.get().packSeedDeps[packId];
    if (applied.revision === currentHash && (failedAgainst === undefined || failedAgainst === deps)) {
      logger.info(`Pack seed skipped (unchanged): ${packId}`);
      continue;
    }

    logger.info(`Importing seeds for pack: ${packId}`);
    let errors: string[];
    /**
     * The record that makes this an apply rather than an import: what the last one wrote per item, the keys
     * this run's content declares, and what this run then did. It is the only reason an entity the user
     * destroyed is known to be theirs, and the only reason the user's edit to one part of an item does not
     * freeze the rest of it.
     *
     * A user-requested import (`IMPORT_PACK_SEEDS`) passes none, which is what makes asking for a pack's
     * data back ask for the entities to come back.
     */
    const record = applyRecord(new Map(Object.entries(applied.items)));
    try {
      // `replace-on-collision` is what the seeders do by default — they branch only on `keep-existing` and
      // `wipe-and-replace` — so naming it changes nothing and says what this is
      errors = importErrors(importSeeds({
        compiledDir: seedsDir,
        mode: 'replace-on-collision',
        applied: record,
      }));
    } catch (err) {
      errors = [errorMessage(err)];
    }
    /**
     * **Recorded whether or not the run succeeded, because what it wrote is written either way.** A run that
     * imported fifty items and failed on the next has changed fifty entities, and the revision moves with
     * them — so nothing re-imports them until the content changes again, and leaving them out would make a
     * later apply read all fifty as the user's.
     *
     * The revision is also the skip gate, which is why it belongs with the items rather than beside them:
     * a revision recorded without the items it describes, or the other way round, is the state in which
     * every item of a pack reads as the user's.
     */
    appliedContent.record(packId, { revision: currentHash, wrote: record.written, dropped: record.removed });
    reportUnresolved(packId, 'have your edits and a newer version waiting', record.conflicts);
    reportUnresolved(packId, 'you edited and the pack no longer ships', record.flagged);
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

