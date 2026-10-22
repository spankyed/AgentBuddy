import { eventTypes } from '@apackdev/sdk/events';

/** Accepted backend lifetimes published by the host; the shell rechecks them through packs.loaded. */
export type ApplicationSurfaceEvents = { type: 'PACK_RUNTIMES_UPDATED'; runtimes: Record<string, string> };
export const APPLICATION_SURFACE_EVENT_TYPES = eventTypes<ApplicationSurfaceEvents>()('PACK_RUNTIMES_UPDATED');
