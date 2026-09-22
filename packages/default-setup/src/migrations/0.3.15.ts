import { tx, untypedQx } from '@abuddy/ears';
import { markSeededRowUnedited } from '@abuddy/sdk/seed';
import { EARS } from '@/__generated__/ears';
import { repository } from '@/__generated__/repository';
import type { PackMigration } from '@abuddy/sdk/framework';
import { createLogger } from '@abuddy/sdk/logger';
import { ref, type FeatureName } from '@/__generated__/ref';
import { addressLinkBlocks, refOf0314Feature } from './bare-feature-ids';
import { DEFAULT_SETTINGS_0314 } from './defaults-0.3.14';
import { isDeepStrictEqual } from 'node:util';
import { isPlainObject } from '@abuddy/sdk/utils/pure';

const logger = createLogger('migrations');

/** This pack's id: what a feature's plugin and system ids are prefixed with */
const PACK_ID = 'default-setup';

export const migration: PackMigration = {
  target: '0.3.15',
  description: "Drop the app's state, the root flow copies and 0.3.14's stored copies of its defaults from the settings, mark rows seeded before the seeder tracked what it wrote as unedited, keep action logs hidden for whoever hid log-service, drop the keys 0.3.14 moved but left behind, and point stored link blocks at plugins' refs",
  up: () => {
    // ── The app's state (onboarding, versions, seed hashes) is the host's AppState now ──
    // The host's own 0.3.15 migration, which runs first, moved it out of `internal` (no pack migration runs when it fails).
    repository.settingsCommands.removeStored(['internal']);

    // ── A plugin's ref is `<packId>/<featureId>` ──
    // The host's own 0.3.15 migration, which runs before any pack's, moved every stored key onto its plugin's ref.
    dropKeysMovedBy0314();

    // ── Rows seeded before the seeder recorded the values it wrote ──
    // The seeder updates a row whose source changed only while its seeded fields still hold what it
    // wrote. Rows seeded by an earlier version have nothing recorded, so every one of them would be
    // skipped as edited from here on, and no built-in action, prompt, flow, document or note would ever
    // be updated again. Marking them unedited restores that, at the cost of one last overwrite of an
    // edit made before this ran; edits after it are honoured.
    let marked = 0;
    for (const entity of Object.values(EARS.Entity)) {
      // Untyped: this walks every entity type the pack knows, not one named here
      for (const row of untypedQx(entity as never).pickAll() as Array<Record<string, unknown>>) {
        if (!row.sourceHash || row.seededFields) continue;
        markSeededRowUnedited(row.id as EARS.EntityId);
        marked++;
      }
    }
    if (marked > 0) logger.info(`[migration 0.3.15] marked ${marked} seeded row(s) as unedited`);

    // ── Action logs moved from the shared `log-service` source to `action:<label>` ──
    // Whoever hid `log-service` hid action logs: keep hiding them.
    const excludedSources = repository.settingsQueries.getPluginSettings(ref('logs'))?.excludedSources;
    if (Array.isArray(excludedSources) && excludedSources.includes('log-service') && !excludedSources.includes('action:*')) {
      repository.settingsCommands.updateSettings('plugin', ref('logs'), ['excludedSources'], [...excludedSources, 'action:*']);
    }

    // ── The root flow is the flow with the root role, and the brain says which one it runs ──
    // Copies of both kept in the settings are no longer read or written.
    repository.settingsCommands.removeStored(['plugins', `${PACK_ID}/flows`, 'rootFlowId']);
    repository.settingsCommands.removeStored(['plugins', `${PACK_ID}/brain`, 'runningRootFlowId']);

    // ── Link blocks name a plugin by its ref ──
    const relinked = addressStoredLinkBlocks();
    if (relinked > 0) logger.info(`[migration 0.3.15] pointed ${relinked} message(s)' link blocks at plugins' refs`);

    // ── 0.3.14 stored every default as if the user had chosen it ──
    // Last, once the steps above moved and dropped keys: pruning first would drop a value the user set under a moved
    // key's new name when it equals today's default, and the old key's value would then be copied over it
    dropDefaultsOf0314();
  },
};

/**
 * 0.3.14 stored the whole default settings with the user's changes merged in, so every upgraded row holds a copy of
 * 0.3.14's defaults (`DEFAULT_SETTINGS_0314`), and a stored value shadows its default: without this, no default of
 * `general`, `assistant` or this pack's plugins could ever change for those users. Each stored value equal to 0.3.14's
 * default at the same path is dropped, an array only when it equals the whole default array, and an object left empty
 * goes with it. A user who deliberately chose a value equal to 0.3.14's default gets today's default instead: the row
 * can't tell the two apart. Another pack's slices are left alone; 0.3.14 stored no defaults for them.
 */
function dropDefaultsOf0314(): void {
  const stored = repository.settingsQueries.getStoredSettings() as Record<string, unknown>;
  // 0.3.14's slices are keyed by bare feature id; the host's 0.3.15 migration moved the stored ones onto refs
  const plugins: Record<string, unknown> = {};
  for (const [id, slice] of Object.entries(DEFAULT_SETTINGS_0314.plugins)) {
    const at = refOf0314Feature(id);
    if (at) plugins[at] = slice;
  }
  const defaults = { ...DEFAULT_SETTINGS_0314, plugins };

  const next: Record<string, unknown> = { ...stored };
  for (const section of ['general', 'assistant', 'plugins'] as const) {
    if (!(section in stored)) continue;
    const kept = withoutDefaults(stored[section], defaults[section]);
    if (kept === undefined) delete next[section];
    else next[section] = kept;
  }
  // One write, and none when nothing is dropped, so a second run changes nothing. The settings store what `next` sets
  // that today's defaults don't, so a value equal to today's default goes too, as the settings drop it on any write.
  if (isDeepStrictEqual(next, stored)) return;
  try {
    repository.settingsCommands.replaceSettings(next);
  } catch (err) {
    // The row as it is still reads correctly, only with 0.3.14's defaults pinned; a thrown migration would instead
    // stop every later migration and the seeds, on every boot, until the settings were fixed by hand
    logger.warn(`[migration 0.3.15] kept 0.3.14's stored defaults: the settings refused the pruned copy (${(err as Error).message})`);
  }
}

/** `stored` without the values equal to `defaults` at the same path, or undefined when nothing is left of it */
function withoutDefaults(stored: unknown, defaults: unknown): unknown {
  if (isDeepStrictEqual(stored, defaults)) return undefined;
  if (!isPlainObject(stored) || !isPlainObject(defaults)) return stored;
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(stored)) {
    const rest = Object.prototype.hasOwnProperty.call(defaults, key) ? withoutDefaults(value, defaults[key]) : value;
    if (rest !== undefined) kept[key] = rest;
  }
  return Object.keys(kept).length > 0 ? kept : undefined;
}

/** Every message's link blocks addressed (`addressLinkBlocks`); a second run finds nothing to change */
function addressStoredLinkBlocks(): number {
  let changed = 0;
  // Untyped: the blocks are data in the shape a message stored them, whatever produced them
  for (const row of untypedQx(EARS.Entity.Message as never).pickAll() as Array<{ id: EARS.EntityId; blocks?: unknown }>) {
    const blocks = addressLinkBlocks(row.blocks);
    if (blocks === row.blocks) continue;
    tx(row.id).put('blocks', blocks as never);
    changed++;
  }
  return changed;
}

/**
 * 0.3.14 copied the code plugin's `lastDirectoryOpened` to `baseDirectory` and the app's `openLinksInApp` to the
 * browser plugin, but left the old keys stored, where nothing reads them. Each is dropped, copied first when the
 * user has nothing stored under the new key and the old one holds something other than 0.3.14's default. The host's
 * 0.3.15 migration ran first, so only the refs hold plugin settings.
 */
function dropKeysMovedBy0314(): void {
  const stored = repository.settingsQueries.getStoredSettings();
  const slice = (feature: FeatureName) => (stored.plugins?.[ref(feature)] ?? {}) as Record<string, unknown>;

  const code = slice('code');
  if (code.lastDirectoryOpened !== undefined) {
    if (code.baseDirectory === undefined) {
      repository.settingsCommands.updateSettings('plugin', ref('code'), ['baseDirectory'], code.lastDirectoryOpened);
    }
    repository.settingsCommands.removeStored(['plugins', ref('code'), 'lastDirectoryOpened']);
  }

  const openLinksInApp = (stored.general?.application as Record<string, unknown> | undefined)?.openLinksInApp;
  if (openLinksInApp !== undefined) {
    // 0.3.14's default is no choice of the user's (`dropDefaultsOf0314`): copied, it would pin that default for good
    const default0314 = (DEFAULT_SETTINGS_0314.general.application as Record<string, unknown>).openLinksInApp;
    if (slice('browser').openLinksInApp === undefined && openLinksInApp !== default0314) {
      repository.settingsCommands.updateSettings('plugin', ref('browser'), ['openLinksInApp'], openLinksInApp);
    }
    repository.settingsCommands.removeStored(['general', 'application', 'openLinksInApp']);
  }
}
