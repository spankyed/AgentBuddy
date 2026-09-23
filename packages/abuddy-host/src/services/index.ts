// The host's implementations of the services packs reach through `services` (contracts in @abuddy/sdk/services),
// and the one place the app's HostRuntime is assembled.
import { secretRedaction } from '../secrets/redaction.ts';
import type { HostRuntime, RootEvents } from '@abuddy/sdk/runtime';
import type { EarsEngine } from '@abuddy/ears';
import type { LmdbStore } from '@abuddy/ears/lmdb';
import type { PackRegistry } from '../packs/registry.ts';
import { createAppData } from './app-data.ts';
import { filesystem } from './filesystem.ts';
import { createSettingsService } from './settings.ts';
import { createSettingsStore, type SettingsDocument } from '../features/settings/be/store.ts';

import { getPackSettingsDefaults } from '@abuddy/sdk/framework';
import { inference } from './inference.ts';
import { secrets } from './secrets.ts';
import { createTraceStore } from './trace-store.ts';

export interface HostRuntimeOptions {
  /** The app's LMDB store, which appData and traceStore work on */
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
    redaction: secretRedaction,
    services: {
      appData: createAppData(store, engine.admin, packs),
      traceStore: createTraceStore(store),
      inference,
      secrets,
      filesystem,
      // The settings in effect before the user changed anything: each installed feature's own and each section a
      // pack registered, both from the packs' registrations, read afresh so a pack coming or going applies at once
      settings: createSettingsService(createSettingsStore({
        defaults: () => getPackSettingsDefaults().settings as SettingsDocument,
      })),
    },
  };
}
