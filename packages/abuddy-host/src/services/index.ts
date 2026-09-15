// The host's implementations of the services packs reach through `services` (contracts and delegates in
// @abuddy/sdk/services). The API registers them at boot.
import { registerHostModule } from '@abuddy/sdk/runtime';
import type { HostImplementedServices } from '@abuddy/sdk/services';
import { appData } from './app-data.ts';
import { inference } from './inference.ts';
import { traceStore } from './trace-store.ts';

/** Each host-implemented service under its key in `services`, which is the host module key its delegate reads */
export const HOST_SERVICES: HostImplementedServices = { appData, traceStore, inference };

/** Registers the host-implemented services where their SDK delegates read them */
export function registerHostServices(): void {
  for (const [key, implementation] of Object.entries(HOST_SERVICES)) registerHostModule(key, implementation);
}
