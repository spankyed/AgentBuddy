import { getHostModule } from '../runtime/host.ts';
import type { HostServices } from './index.ts';

/** @internal The services the host implements. Each is registered under its key in `services` */
export type HostImplementedServices = Pick<HostServices, 'appData' | 'traceStore' | 'inference'>;

/** @internal The host's implementation of a service, registered at boot under the service's key */
export const hostService = <K extends keyof HostImplementedServices>(key: K): HostImplementedServices[K] => getHostModule(key);
