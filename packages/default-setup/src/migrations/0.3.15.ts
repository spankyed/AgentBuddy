import { untypedQx } from '@abuddy/ears';
import { markSeededRowUnedited } from '@abuddy/sdk/seed';
import { EARS, tx } from '@/__generated__/ears';
import { repository } from '@/__generated__/repository';
import type { PackMigration } from '@abuddy/sdk/framework';
import { createLogger } from '@abuddy/sdk/logger';
import { ref } from '@/__generated__/ref';

const logger = createLogger('migrations');

/** This pack's id: what a feature's plugin and system ids are prefixed with */
const PACK_ID = 'default-setup';

export const migration: PackMigration = {
  target: '0.3.15',
  description: "Drop the app's state and the root flow copies from the settings, mark rows seeded before the seeder tracked what it wrote as unedited, keep action logs hidden for whoever hid log-service, drop the keys 0.3.14 moved but left behind, and point stored link blocks at plugins' refs",
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

    // ── A link block opens a plugin by its ref ──
    const relinked = addressLinkTargets();
    if (relinked > 0) logger.info(`[migration 0.3.15] pointed ${relinked} message(s)' link blocks at plugins' refs`);
  },
};

/** A link block's target, as a message stores it */
interface StoredLink { event?: { target?: unknown } }

/**
 * Link blocks stored before 0.3.15 name the plugin they open by its bare feature id, which this pack's plugin ran
 * under: a feature id this pack and another shared was this pack's, as the host's migration settles it for settings.
 * Each becomes this pack's ref. `external` stays, as does `application`, which sent the app shell an event rather than
 * naming a plugin, and a ref is left as it is, so a second run changes nothing.
 */
function addressLinkTargets(): number {
  let changed = 0;
  // Untyped: the blocks are data in the shape a message stored them, whatever produced them
  for (const row of untypedQx(EARS.Entity.Message as never).pickAll() as Array<{ id: string; blocks?: unknown }>) {
    if (!Array.isArray(row.blocks)) continue;
    let moved = false;
    const blocks = row.blocks.map((block: { type?: unknown; props?: { links?: unknown } }) => {
      if (block?.type !== 'link' || !Array.isArray(block.props?.links)) return block;
      const links = (block.props.links as StoredLink[]).map((link) => {
        const target = link?.event?.target;
        if (typeof target !== 'string' || target === 'external' || target === 'application' || target.includes('/')) return link;
        moved = true;
        return { ...link, event: { ...link.event, target: `${PACK_ID}/${target}` } };
      });
      return { ...block, props: { ...block.props, links } };
    });
    if (!moved) continue;
    tx(row.id as EARS.EntityId).put('blocks', blocks as never);
    changed++;
  }
  return changed;
}

/**
 * 0.3.14 copied the code plugin's `lastDirectoryOpened` to `baseDirectory` and the app's `openLinksInApp` to the
 * browser plugin, but left the old keys stored, where nothing reads them. Each is dropped, copied first when the
 * user has nothing stored under the new key. The host's 0.3.15 migration ran first, so only the refs hold plugin settings.
 */
function dropKeysMovedBy0314(): void {
  const stored = repository.settingsQueries.getStoredSettings();
  const slice = (feature: string) => (stored.plugins?.[ref(feature)] ?? {}) as Record<string, unknown>;

  const code = slice('code');
  if (code.lastDirectoryOpened !== undefined) {
    if (code.baseDirectory === undefined) {
      repository.settingsCommands.updateSettings('plugin', ref('code'), ['baseDirectory'], code.lastDirectoryOpened);
    }
    repository.settingsCommands.removeStored(['plugins', ref('code'), 'lastDirectoryOpened']);
  }

  const openLinksInApp = (stored.general?.application as Record<string, unknown> | undefined)?.openLinksInApp;
  if (openLinksInApp !== undefined) {
    if (slice('browser').openLinksInApp === undefined) {
      repository.settingsCommands.updateSettings('plugin', ref('browser'), ['openLinksInApp'], openLinksInApp);
    }
    repository.settingsCommands.removeStored(['general', 'application', 'openLinksInApp']);
  }
}
