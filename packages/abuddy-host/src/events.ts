// The host's own sends: typed per receiving feature, and stamped with `host` as the sender.
//
// The app is the pack `host`, so it builds its sends the way a pack's `#generated/events` does — `defineEvents`
// bound to its id — and its code names features the same way: its own by feature id, anyone else's by ref. What
// differs is where the maps come from. A pack's are generated from its manifest; the host has no codegen, so they
// are assembled here from what its features already declare.
//
// The maps are the three `receives` expressions in `features/registration.ts`, as types. Those are the runtime
// lists the bus checks a send against, so the two say the same thing about the same features — keep them together.
import { defineEvents, type HostPluginEvents, type HostSystemEvents, type IncomingEventsOf, type WithOwnNames } from '@abuddy/sdk/events';
import { HOST_PACK_ID } from '@abuddy/sdk/ids';
import type { Contract as PacksContract } from './features/packs/be/contract.ts';
import type { Contract as SettingsContract } from './features/settings/be/contract.ts';
import type { SettingsPluginEvents } from './features/settings/be/system.ts';
import type { OutgoingPacksEvents } from './features/registration.ts';

/**
 * What each of the host's plugins receives. `HostPluginEvents` is the host's *published* inbox — what a pack may
 * send it — so it is one half of two of these: the rest is what the feature's own system sends its view, which no
 * pack may send. The Packs view takes only the latter.
 */
type HostPlugins = WithOwnNames<typeof HOST_PACK_ID, {
  'host/application': HostPluginEvents['host/application'];
  'host/packs': OutgoingPacksEvents;
  'host/settings': SettingsPluginEvents | HostPluginEvents['host/settings'];
}>;

/** What each of the host's systems receives, from the contracts those features declare */
type HostSystems = WithOwnNames<typeof HOST_PACK_ID, {
  'host/bus': HostSystemEvents['host/bus'];
  'host/packs': IncomingEventsOf<PacksContract>;
  'host/settings': IncomingEventsOf<SettingsContract>;
}>;

export const { broadcastToPlugin, sendToPlugin, sendToSystem } = defineEvents<HostPlugins, HostSystems>(HOST_PACK_ID);
