import { untypedQx } from '@abuddy/ears';
import { markSeededRowUnedited } from '@abuddy/sdk/seed';
import { EARS } from '@/__generated__/ears';
import { repository } from '@/__generated__/repository';
import type { PackMigration } from '@abuddy/sdk/framework';
import { createLogger } from '@abuddy/sdk/logger';
import type { SettingsData } from '@/features/settings/be/types';

const logger = createLogger('migrations');

/** This pack's id: what a feature's plugin and system ids are prefixed with */
const PACK_ID = 'default-setup';

export const migration: PackMigration = {
  target: '0.3.15',
  description: "Drop the app's state and the root flow copies from the settings, mark rows seeded before the seeder tracked what it wrote as unedited, keep action logs hidden for whoever hid log-service, and move the plugin settings onto namespaced plugin ids",
  up: () => {
    // ── The app's state (onboarding, versions, seed hashes) is the host's AppState now ──
    // The host's own 0.3.15 migration, which runs first, moved it out of `internal` (no pack migration runs when it fails).
    repository.settingsCommands.removeStored(['internal']);

    // ── A plugin is addressed `<packId>.<featureId>` ──
    // First among the plugin-settings work below, so the rest reads and writes the keys this leaves.
    movePluginSettingsToQualifiedIds();

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
    const excludedSources = repository.settingsQueries.getPluginSettings('logs')?.excludedSources;
    if (Array.isArray(excludedSources) && excludedSources.includes('log-service') && !excludedSources.includes('action:*')) {
      repository.settingsCommands.updateSettings('plugin', 'logs', ['excludedSources'], [...excludedSources, 'action:*']);
    }

    // ── The root flow is the flow with the root role, and the brain says which one it runs ──
    // Copies of both kept in the settings are no longer read or written.
    repository.settingsCommands.removeStored(['plugins', `${PACK_ID}.flows`, 'rootFlowId']);
    repository.settingsCommands.removeStored(['plugins', `${PACK_ID}.brain`, 'runningRootFlowId']);
  },
};

/**
 * The plugin ids this pack's settings were stored under before plugins were namespaced. Written out
 * rather than read from the pack's features on purpose: a migration moves the data one release left
 * behind, so it has to keep meaning what it meant then, even after a feature is added or removed.
 */
const BARE_PLUGIN_IDS = [
  'threads', 'code', 'notes', 'browser', 'library', 'flows',
  'actions', 'prompts', 'brain', 'database', 'logs', 'settings',
];

/**
 * Moves the user's per-plugin settings, sidebar visibility and last-active plugin onto the ids their
 * plugins now run under. Without it a user's pinned plugins and last-active plugin point at nothing:
 * the app reads the plugin's address, `<packId>.threads`, and the stored data says `plugins.threads`.
 *
 * Idempotent, as every migration here must be — it runs again on each development boot and after a
 * reset. A key already moved is left alone, and a key the user has under the qualified id already wins.
 */
function movePluginSettingsToQualifiedIds(): void {
  const stored = repository.settingsQueries.getStoredSettings();
  const plugins = stored.plugins as Record<string, unknown> | undefined;
  if (!plugins) return;

  const next = { ...plugins };
  let moved = 0;
  /** Moves `bare` to `<packId>.<bare>` in `record`, unless it's gone or the qualified key is taken */
  const move = (record: Record<string, unknown>, bare: string): void => {
    const qualified = `${PACK_ID}.${bare}`;
    if (!(bare in record) || qualified in record) return;
    record[qualified] = record[bare];
    delete record[bare];
    moved++;
  };

  for (const id of BARE_PLUGIN_IDS) move(next, id);

  const meta = next._meta as { visibility?: Record<string, boolean>; lastActivePlugin?: string } | undefined;
  if (meta) {
    const nextMeta = { ...meta };
    if (nextMeta.visibility) {
      const visibility = { ...nextMeta.visibility };
      for (const id of BARE_PLUGIN_IDS) move(visibility as Record<string, unknown>, id);
      nextMeta.visibility = visibility;
    }
    if (nextMeta.lastActivePlugin && BARE_PLUGIN_IDS.includes(nextMeta.lastActivePlugin)) {
      nextMeta.lastActivePlugin = `${PACK_ID}.${nextMeta.lastActivePlugin}`;
      moved++;
    }
    next._meta = nextMeta;
  }

  if (moved === 0) return;
  repository.settingsCommands.replaceSettings({ ...stored, plugins: next } as SettingsData);
  logger.info(`[migration 0.3.15] moved ${moved} plugin settings key(s) onto namespaced plugin ids`);
}
