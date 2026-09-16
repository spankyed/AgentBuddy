import { untypedQx } from '@abuddy/sdk/ears';
import { markSeededRowUnedited } from '@abuddy/sdk/seed';
import { EARS } from '@/__generated__/ears';
import { repository } from '@/__generated__/repository';
import type { PackMigration } from '@abuddy/sdk/framework';
import { createLogger } from '@abuddy/sdk/logger';

const logger = createLogger('migrations');

/** This pack's id, which its boot seed is now recorded under */
const PACK_ID = 'default-setup';

export const migration: PackMigration = {
  target: '0.3.15',
  description: "Record the boot seed per pack, mark rows seeded before the seeder tracked what it wrote as unedited, and keep action logs hidden for whoever hid log-service",
  up: () => {
    const internal = repository.settingsQueries.getInternalSettings() as Record<string, any>;

    // ── The boot seed is recorded per pack, so several built-in packs don't overwrite each other ──
    // Without this the app forgets it ever seeded and re-imports the whole boot seed on the next boot.
    if (internal.seedHash && !internal.seedHashes?.[PACK_ID]) {
      repository.settingsCommands.updateSettings('internal', null, ['seedHashes'], { ...internal.seedHashes, [PACK_ID]: internal.seedHash });
    }
    if (internal.seedStatFingerprint && !internal.seedStatFingerprints?.[PACK_ID]) {
      repository.settingsCommands.updateSettings('internal', null, ['seedStatFingerprints'], { ...internal.seedStatFingerprints, [PACK_ID]: internal.seedStatFingerprint });
    }

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
    const excludedSources = (repository.settingsQueries.getSettings().plugins as any)?.logs?.excludedSources;
    if (Array.isArray(excludedSources) && excludedSources.includes('log-service') && !excludedSources.includes('action:*')) {
      repository.settingsCommands.updateSettings('plugin', 'logs', ['excludedSources'], [...excludedSources, 'action:*']);
    }
  },
};
