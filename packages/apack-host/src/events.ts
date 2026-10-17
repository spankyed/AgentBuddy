// The host's own sends: typed per receiving feature, and stamped with `host` as the sender.
//
// The app is the pack `host`, so it builds its sends the way a pack's `#generated/events` does — `defineEvents`
// bound to its id — and its code names features the same way: its own by feature id, anyone else's by ref. What
// differs is where the maps come from. A pack's are generated from its manifest; the host has no codegen, so they
// are assembled here from what its features already declare.
//
// Static endpoint membership lives in `features/event-contracts.ts`; this module supplies payload types
// for the same native inboxes. Pack code gets its corresponding maps from codegen.
import { defineEvents, type HostPluginEvents, type HostSystemEvents, type IncomingEventsOf, type WithOwnNames } from '@apackdev/sdk/events';
import type { Contract as HelpContract } from './features/help/be/system.ts';
import type { HelpOutgoing } from './features/event-contracts.ts';
import { HOST_PACK_ID } from '@apackdev/sdk/ids';
import type { Contract as PacksContract } from './features/packs/be/contract.ts';
import type { Contract as SettingsContract } from './features/settings/be/contract.ts';
import type { SettingsPluginEvents } from './features/event-contracts.ts';
import type { ApplicationPluginEvents } from './features/application/events.ts';
import type { OutgoingPacksEvents } from './features/event-contracts.ts';

/**
 * What each of the host's plugins receives. `HostPluginEvents` is the host's *published* inbox — what a pack may
 * send it — so it is one half of two of these: the rest is what the feature's own system sends its view, which no
 * pack may send. The Packs view takes only the latter.
 */
type HostPlugins = WithOwnNames<typeof HOST_PACK_ID, {
  'host/application': HostPluginEvents['host/application'] | ApplicationPluginEvents;
  'host/packs': OutgoingPacksEvents;
  'host/settings': HelpOutgoing | SettingsPluginEvents | HostPluginEvents['host/settings'];
}>;

/** What each of the host's systems receives, from the contracts those features declare */
type HostSystems = WithOwnNames<typeof HOST_PACK_ID, {
  'host/bus': HostSystemEvents['host/bus'];
  'host/packs': IncomingEventsOf<PacksContract>;
  'host/help': IncomingEventsOf<HelpContract>;
  'host/settings': IncomingEventsOf<SettingsContract>;
}>;

export const { broadcastToPlugin, sendToPlugin, sendToSystem } = defineEvents<HostPlugins, HostSystems>(HOST_PACK_ID);
