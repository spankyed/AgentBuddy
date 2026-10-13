import { eventTypes } from '@apackdev/sdk/events';

/** Accepted backend lifetimes published by the host; the shell rechecks them through packs.loaded. */
export type ApplicationPluginEvents = { type: 'PACK_RUNTIMES_UPDATED'; runtimes: Record<string, string> };
export const APPLICATION_PLUGIN_EVENT_TYPES = eventTypes<ApplicationPluginEvents>()('PACK_RUNTIMES_UPDATED');
