import { untypedQx } from '@abuddy/ears';
import { markSeededRowUnedited } from '@abuddy/sdk/seed';
import { EARS } from '@/__generated__/ears';
import { repository } from '@/__generated__/repository';
import type { PackMigration } from '@abuddy/sdk/framework';
import { createLogger } from '@abuddy/sdk/logger';
import { ref } from '@/__generated__/ref';

const logger = createLogger('migrations');

/** This pack's id: what a feature's plugin and system ids are prefixed with */
const PACK_ID = 'default-setup';

export const migration: PackMigration = {
  target: '0.3.15',
  description: "Drop the app's state and the root flow copies from the settings, mark rows seeded before the seeder tracked what it wrote as unedited, keep action logs hidden for whoever hid log-service, and drop the keys 0.3.14 moved but left behind",
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
  },
};

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
