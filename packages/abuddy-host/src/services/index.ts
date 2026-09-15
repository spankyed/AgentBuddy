// The host's implementations of the services packs reach through `services` (HostServices in
// @abuddy/sdk/services, each with its contract and delegate there). The API registers them at boot.
import { registerHostModule } from '@abuddy/sdk/runtime';
import type { HostServices } from '@abuddy/sdk/services';
import { appData } from './app-data.ts';
import { inference } from './inference.ts';
import { traceStore } from './trace-store.ts';

export { appData } from './app-data.ts';
export { inference, languageModel } from './inference.ts';
export { traceStore } from './trace-store.ts';

/** Each host-implemented service, by the host module name its SDK delegate reads */
export const HOST_SERVICE_MODULES = {
  'app-data': appData,
  'trace-store': traceStore,
  'inference': inference,
} as const satisfies { 'app-data': HostServices['appData']; 'trace-store': HostServices['traceStore']; 'inference': HostServices['inference'] };

/** Registers the host-implemented services as the host modules their SDK delegates read */
export function registerHostServices(): void {
  for (const [name, implementation] of Object.entries(HOST_SERVICE_MODULES)) registerHostModule(name, implementation);
}
