import type { LogsSettings } from '#generated/types.ts';
import { services } from '#generated/services.ts';
import { untypedTx, untypedQx } from '@apack/ears';
import { EARS } from '#generated/ears.ts';
import type { DeclaredMigration } from '@apack/sdk/framework';
import { createLogger } from '@apack/sdk/logger';
import { ref, type FeatureName } from '#generated/ref.ts';
import { addressLinkBlocks, refOf0314Feature } from './bare-feature-ids.ts';
import { DEFAULT_SETTINGS_0314 } from './defaults-0.3.14.ts';
import { isDeepStrictEqual } from 'node:util';
import { hasOwn, isPlainObject } from '@apack/sdk/utils/pure';

const logger = createLogger('migrations');

/** This pack's id: what a feature's plugin and system ids are prefixed with */
const PACK_ID = 'default-setup';

export const migration: DeclaredMigration = {
  description: "Drop the app's state, the root flow copies and 0.3.14's stored copies of its defaults from the settings, keep action logs hidden for whoever hid log-service, drop the keys 0.3.14 moved but left behind, unwrap general.projects, point stored link blocks at plugins' refs, and give library rows the short codes and display orders the library used to backfill on every connection",
  up: () => {
    // ── The app's state (onboarding, versions, content revisions) is the host's AppState now ──
    // The host's own 0.3.15 migration, which runs first, moved it out of `internal` (no pack migration runs when it fails).
    services.settings.removeStored(['internal']);

    // ── A plugin's ref is `<packId>/<featureId>` ──
    // The host's own 0.3.15 migration, which runs before any pack's, moved every stored key onto its plugin's ref.
    dropKeysMovedBy0314();

    // Entities written before anything recorded which *part* of one we wrote need no migration: an apply
    // adopts an entity it wrote with no recorded parts and re-stamps it (`content/merge.ts`'s `resolve`), which
    // is what a loop here used to do by hand for the entities of one release.

    // ── Action logs moved from the shared `log-service` source to `action:<label>` ──
    // Whoever hid `log-service` hid action logs: keep hiding them.
    const excludedSources = services.settings.forFeature<LogsSettings>(ref('logs'))?.excludedSources;
    if (Array.isArray(excludedSources) && excludedSources.includes('log-service') && !excludedSources.includes('action:*')) {
      services.settings.setForFeature(ref('logs'), ['excludedSources'], [...excludedSources, 'action:*']);
    }

    // ── The root flow is the flow with the root role, and the brain says which one it runs ──
    // Copies of both kept in the settings are no longer read or written.
    services.settings.removeStored(['plugins', `${PACK_ID}/flows`, 'rootFlowId']);
    services.settings.removeStored(['plugins', `${PACK_ID}/brain`, 'runningRootFlowId']);

    // ── `general.projects` is the array, not a wrapper around one ──
    // It was `{ projects: [...] }` once, and the Settings view read both shapes on every render to cope. Moving
    // the stored value is what lets that view read one shape.
    unwrapStoredProjects();

    // ── Short codes and display orders the library backfilled on every client connection ──
    const backfilled = backfillLibraryOrdering();
    if (backfilled > 0) logger.info(`[migration 0.3.15] backfilled ${backfilled} library row(s)`);

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
 * `general.projects` held `{ projects: [...] }` before it held the array itself. Only the Settings view ever read
 * it, and it accepted both shapes; this moves the stored value so one shape is left to read.
 */
function unwrapStoredProjects(): void {
  const general = (services.settings.getStored() as Record<string, unknown>).general;
  if (!isPlainObject(general)) return;
  const projects = general.projects;
  if (Array.isArray(projects) || !isPlainObject(projects) || !Array.isArray(projects.projects)) return;
  services.settings.setInSection('general', ['projects'], projects.projects);
  logger.info(`[migration 0.3.15] unwrapped general.projects (${projects.projects.length} project(s))`);
}

/**
 * 0.3.14 stored the whole default settings with the user's changes merged in, so every upgraded row holds a copy of
 * 0.3.14's defaults (`DEFAULT_SETTINGS_0314`), and a stored value shadows its default: without this, no default of
 * `general`, `assistant` or this pack's plugins could ever change for those users. Each stored value equal to 0.3.14's
 * default at the same path is dropped, an array only when it equals the whole default array, and an object left empty
 * goes with it. A user who deliberately chose a value equal to 0.3.14's default gets today's default instead: the row
 * can't tell the two apart. Another pack's slices are left alone; 0.3.14 stored no defaults for them.
 */
function dropDefaultsOf0314(): void {
  const stored = services.settings.getStored() as Record<string, unknown>;
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
    services.settings.replaceAll(next);
  } catch (err) {
    // The row as it is still reads correctly, only with 0.3.14's defaults pinned; a thrown migration would instead
    // stop every later migration and the content, on every boot, until the settings were fixed by hand
    logger.warn(`[migration 0.3.15] kept 0.3.14's stored defaults: the settings refused the pruned copy (${(err as Error).message})`);
  }
}

/** `stored` without the values equal to `defaults` at the same path, or undefined when nothing is left of it */
function withoutDefaults(stored: unknown, defaults: unknown): unknown {
  if (isDeepStrictEqual(stored, defaults)) return undefined;
  if (!isPlainObject(stored) || !isPlainObject(defaults)) return stored;
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(stored)) {
    const rest = hasOwn(defaults, key) ? withoutDefaults(value, defaults[key]) : value;
    if (rest !== undefined) kept[key] = rest;
  }
  return Object.keys(kept).length > 0 ? kept : undefined;
}

/**
 * Documents gained a `shortCode`, and Documents and Collections an integer `displayOrder`, after some rows were
 * already stored. The library answered that by backfilling inside the action that publishes its data — so it ran
 * on every client connection and every pack change, for the life of the install, to do nothing. It runs here once.
 *
 * The same guards, so a second run writes nothing: a row that has the field is left alone, and `displayOrder` is
 * taken from the array it used to be stored as when there is one.
 */
function backfillLibraryOrdering(): number {
  let changed = 0;
  // Untyped: these walk rows as they are stored, including ones written before the fields existed
  (untypedQx(EARS.Entity.Document).pickAll() as Array<{ id: EARS.EntityId; shortCode?: unknown }>)
    .forEach((document, index) => {
      if (document.shortCode) return;
      untypedTx(document.id).put('shortCode', `DOC-${index + 1}`);
      changed++;
    });

  for (const entity of [EARS.Entity.Document, EARS.Entity.Collection]) {
    let order = 1000;
    for (const row of untypedQx(entity).pickAll() as Array<{ id: EARS.EntityId; displayOrder?: unknown }>) {
      const stored = row.displayOrder;
      if (!Array.isArray(stored) && stored) continue;
      untypedTx(row.id).update('displayOrder', (Array.isArray(stored) ? stored[0] || order : order));
      order += 1000;
      changed++;
    }
  }
  return changed;
}

/** Every message's link blocks addressed (`addressLinkBlocks`); a second run finds nothing to change */
function addressStoredLinkBlocks(): number {
  let changed = 0;
  // Untyped: the blocks are data in the shape a message stored them, whatever produced them
  for (const row of untypedQx(EARS.Entity.Message).pickAll() as Array<{ id: EARS.EntityId; blocks?: unknown }>) {
    const blocks = addressLinkBlocks(row.blocks);
    if (blocks === row.blocks) continue;
    untypedTx(row.id).put('blocks', blocks);
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
  const stored = services.settings.getStored();
  const slice = (feature: FeatureName) => (stored.plugins?.[ref(feature)] ?? {}) as Record<string, unknown>;

  const code = slice('code');
  if (code.lastDirectoryOpened !== undefined) {
    if (code.baseDirectory === undefined) {
      services.settings.setForFeature(ref('code'), ['baseDirectory'], code.lastDirectoryOpened);
    }
    services.settings.removeStored(['plugins', ref('code'), 'lastDirectoryOpened']);
  }

  const storedGeneral = stored.general as { application?: Record<string, unknown> } | undefined;
  const openLinksInApp = storedGeneral?.application?.openLinksInApp;
  if (openLinksInApp !== undefined) {
    // 0.3.14's default is no choice of the user's (`dropDefaultsOf0314`): copied, it would pin that default for good
    const default0314 = (DEFAULT_SETTINGS_0314.general.application as Record<string, unknown>).openLinksInApp;
    if (slice('browser').openLinksInApp === undefined && openLinksInApp !== default0314) {
      services.settings.setForFeature(ref('browser'), ['openLinksInApp'], openLinksInApp);
    }
    services.settings.removeStored(['general', 'application', 'openLinksInApp']);
  }
}
