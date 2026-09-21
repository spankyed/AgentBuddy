/** The app itself is the pack `host`: its features are spelled like any pack's, and no pack may take its id */
export const HOST_PACK_ID = 'host';

/** The host's bus system, which pack systems send their plugin events through (`system.get(bus)`) */
export const bus = 'host/bus' as const;
