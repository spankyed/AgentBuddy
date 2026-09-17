// The host's implementations of the services packs reach through `services` (contracts in @abuddy/sdk/services),
// and the one place the app's HostRuntime is assembled.
import type { HostRuntime, RootEvents } from '@abuddy/sdk/runtime';
import type { HostImplementedServices } from '@abuddy/sdk/services';
import type { EarsAdmin, EarsEngine } from '@abuddy/ears';
import type { LmdbStore } from '@abuddy/ears/lmdb';
import type { PackRegistry } from '../packs/pack-registration.ts';
import { createAppData } from './app-data.ts';
import { inference } from './inference.ts';
import { secrets } from './secrets.ts';
import { createTraceStore } from './trace-store.ts';

/** What the host-implemented services work on: the app's LMDB store, the engine it persists (its admin face), and its registered packs */
export interface HostServicesOptions {
  store: LmdbStore;
  engine: EarsAdmin;
  packs: PackRegistry;
}

/** Each host-implemented service under its key in `services` */
export function createHostServices({ store, engine, packs }: HostServicesOptions): HostImplementedServices {
  return { appData: createAppData(store, engine, packs), traceStore: createTraceStore(store), inference, secrets };
}

export interface HostRuntimeOptions {
  /** The app's LMDB store */
  store: LmdbStore;
  /** The app's engine: packs get its query face, the services its admin face */
  engine: EarsEngine;
  /** The app's event bus */
  transport: { rootEvents: RootEvents };
  /** The app's registered packs (`createPackRegistry()`): packs read them through the SDK, the services reset and seed them */
  packs: PackRegistry;
  appVersion: string;
}

/** The running app as the SDK reaches it, which the composition root binds with `bindHost` */
export function createHostRuntime({ transport, appVersion, store, engine, packs }: HostRuntimeOptions): HostRuntime {
  return {
    transport,
    ears: engine.query,
    packs,
    appVersion,
    services: createHostServices({ store, engine: engine.admin, packs }),
  };
}
