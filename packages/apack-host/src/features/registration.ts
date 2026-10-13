// The app's own features, registered as the pack `host` like any pack: so every registry lookup, validation map and
// sort treats them as it treats a pack's, with no side channel. The plugins are always there; the systems only where
// the caller runs them (the app does; the test harness runs no Packs system).
import { eventTypes, HOST_PLUGIN_EVENT_TYPES } from '@apackdev/sdk/events';
import type { PackFeatureSystem, PackRegistration } from '@apackdev/sdk/framework';
import { HOST_PACK_ID } from '@apackdev/sdk/ids';
import { APPLICATION_PLUGIN_EVENT_TYPES } from './application/events.ts';
import { hostFeatureIds } from './declaration.ts';
import type { AppPackSourceSummary, InstalledPackSummary } from '../packs/registry.ts';
import { helpSystem, helpEvents } from './help/be/system.ts';
import { SETTINGS_PLUGIN_EVENT_TYPES } from './settings/be/system.ts';

/** What the host `packs` system sends its plugin */
export type OutgoingPacksEvents =
  | { type: 'PACKS_LIST'; packs: InstalledPackSummary[]; appPackSources: AppPackSourceSummary[]; appPackSourceProblems: { id: string; message: string }[] }
  | { type: 'PACK_INSTALL_STARTED'; packSlug: string }
  | { type: 'PACK_INSTALL_COMPLETE'; packSlug: string; packId: string; packName: string; version: string }
  | { type: 'PACK_INSTALL_FAILED'; packSlug: string; error: string }
  | { type: 'PACK_UNINSTALL_COMPLETE'; packId: string }
  | { type: 'PACK_UNINSTALL_FAILED'; packId: string; error: string }
  | { type: 'PACK_ENABLED_CHANGED'; packId: string; enabled: boolean }
  | { type: 'PACK_ACTIVATED'; packId: string }
  | { type: 'PACK_DEACTIVATED'; packId: string }
  | { type: 'PACK_UPDATE_COMPLETE'; packId: string; version: string }
  | { type: 'PACK_UPDATE_FAILED'; packId: string; error: string };

/**
 * The event types the `packs` plugin receives. Not part of `HostPluginEvents`, which is the host's published
 * inbox — what any pack may send it, as a pack's plugin publishes its own in its `Contract`. These are the
 * host's to send itself, and no pack's.
 */
export const PACKS_PLUGIN_EVENT_TYPES = eventTypes<OutgoingPacksEvents>()(
  'PACKS_LIST',
  'PACK_INSTALL_STARTED',
  'PACK_INSTALL_COMPLETE',
  'PACK_INSTALL_FAILED',
  'PACK_UNINSTALL_COMPLETE',
  'PACK_UNINSTALL_FAILED',
  'PACK_ENABLED_CHANGED',
  'PACK_ACTIVATED',
  'PACK_DEACTIVATED',
  'PACK_UPDATE_COMPLETE',
  'PACK_UPDATE_FAILED',
);

/** The host's registration: its plugins, and the systems in `systems` */
export function hostRegistration(systems: { application?: PackFeatureSystem; packs?: PackFeatureSystem; settings?: PackFeatureSystem } = {}): PackRegistration {
  return {
    id: HOST_PACK_ID,
    features: {
      [hostFeatureIds.application]: { ...(systems.application && { system: systems.application }), plugin: { receives: [...HOST_PLUGIN_EVENT_TYPES['host/application'], ...APPLICATION_PLUGIN_EVENT_TYPES] } },
      [hostFeatureIds.help]: { system: { machine: helpSystem, receives: [...helpEvents] } },
      [hostFeatureIds.packs]: { ...(systems.packs && { system: systems.packs }), plugin: { receives: PACKS_PLUGIN_EVENT_TYPES } },
      // The app's settings: the store's system, and the Settings view the renderer draws. It takes what its own
      // system sends, and what a pack may send it (`HOST_PLUGIN_EVENT_TYPES`): only that pack can find those out.
      [hostFeatureIds.settings]: { ...(systems.settings && { system: systems.settings }), plugin: { receives: ['HELP_CATALOG', ...SETTINGS_PLUGIN_EVENT_TYPES, ...HOST_PLUGIN_EVENT_TYPES['host/settings']] } },
    },
  };
}
