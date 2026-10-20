// Static host endpoint contracts; importing these constructs no systems or services.
import { eventTypes, HOST_PLUGIN_EVENT_TYPES } from '@apackdev/sdk/events';
import type { PackEventContracts, HelpCatalog } from '@apackdev/sdk/framework';
import type { AppPackSourceSummary, InstalledPackSummary } from '../packs/registry.ts';
import type { IncomingPacksEvents } from './packs/be/types.ts';
import type { IncomingSettingsEvents, IncomingSecretsEvents, OutgoingSettingsEvents } from './settings/be/types.ts';
import { APPLICATION_PLUGIN_EVENT_TYPES } from './application/events.ts';

export type ApplicationClientEvent =
  | { type: 'SET_PLUGIN_VISIBILITY'; plugin: string; visible: boolean }
  | { type: 'SET_LAST_ACTIVE_PLUGIN'; plugin: string };
export const APPLICATION_SYSTEM_EVENTS = eventTypes<ApplicationClientEvent>()('SET_PLUGIN_VISIBILITY', 'SET_LAST_ACTIVE_PLUGIN');
export type HelpOutgoing = { type: 'HELP_CATALOG'; catalog: HelpCatalog };
export const helpEvents = ['GET_HELP', 'CLIENT_CONNECTED'] as const;

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

export const packsEvents = eventTypes<IncomingPacksEvents>()(
  'INSTALL_PACK',
  'REPLACE_PACK',
  'RESTORE_PACK',
  'UNINSTALL_PACK',
  'TOGGLE_PACK_ENABLED',
  'GET_INSTALLED_PACKS',
  'UPDATE_PACK',
  'UPDATE_APP_PACK',
  'CHECK_FOR_UPDATES',
  'PREVIEW_PACK_CONTENT',
  'IMPORT_PACK_CONTENT',
  'RESTORE_CONTENT_ITEM',
  'DISMISS_CONTENT_OFFER',
  'DELETE_CONTENT_ITEM',
);

export const settingsEvents = eventTypes<IncomingSettingsEvents | IncomingSecretsEvents>()(
  'GET_SETTINGS', 'RECOVER_SETTINGS', 'UPDATE_SETTINGS', 'RESET_SETTINGS', 'RESET_ALL_SETTINGS', 'REPLACE_SETTINGS', 'RESET_APP', 'SECRETS_CHANGED',
);

/** What the settings system sends its own plugin: everything outgoing but the shell's hotkeys */
export type SettingsPluginEvents = Exclude<OutgoingSettingsEvents, { type: 'APPLICATION_HOTKEYS' }>;

/** The event types the `settings` plugin receives; the host's to send, and no pack's */
export const SETTINGS_PLUGIN_EVENT_TYPES = eventTypes<SettingsPluginEvents>()(
  'SETTINGS_RECOVERY',
  'SETTINGS_RECOVERED',
  'SETTINGS_LOADED',
  'SETTINGS_UPDATED',
  'SETTINGS_SAVED',
  'SETTINGS_REFUSED',
  'SETTINGS_RESET',
  'PACK_CONTENT_IMPORTED',
  'PACK_CONTENT_IMPORT_FAILED',
  'PACK_CONTENT_PREVIEW',
  'PACK_CONTENT_PREVIEW_FAILED',
  'APP_RESET_COMPLETE',
  'APP_RESET_FAILED',
  'SECRETS_UPDATED',
);

/** Native endpoint metadata includes the shell inbox without advertising it as a sidebar pane. */
export const hostEventContracts = {
  application: {
    system: { incoming: APPLICATION_SYSTEM_EVENTS, outgoing: ['PACK_RUNTIMES_UPDATED', 'PLUGIN_VISIBILITY_UPDATED'] },
    plugin: { receives: [...HOST_PLUGIN_EVENT_TYPES['host/application'], ...APPLICATION_PLUGIN_EVENT_TYPES] },
  },
  help: { system: { incoming: helpEvents, outgoing: ['HELP_CATALOG'] } },
  packs: { system: { incoming: packsEvents, outgoing: PACKS_PLUGIN_EVENT_TYPES }, plugin: { receives: PACKS_PLUGIN_EVENT_TYPES } },
  settings: {
    system: { incoming: settingsEvents, outgoing: [...SETTINGS_PLUGIN_EVENT_TYPES, 'APPLICATION_HOTKEYS'] },
    plugin: { receives: ['HELP_CATALOG', ...SETTINGS_PLUGIN_EVENT_TYPES, ...HOST_PLUGIN_EVENT_TYPES['host/settings']] },
  },
} satisfies PackEventContracts;
