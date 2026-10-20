import { compileSettingsCatalog } from '../features/settings/validation.ts';
// The host's implementations of the services packs reach through `services` (contracts in @apackdev/sdk/services),
// and the one place the app's HostRuntime is assembled.
import { secretRedaction } from '../secrets/redaction.ts';
import type { HostRuntime, RootEvents } from '@apackdev/sdk/runtime';
import type { EarsEngine } from '@apackdev/ears';
import type { LmdbStore } from '@apackdev/ears/lmdb';
import type { PackRegistry } from '../packs/registry.ts';
import { createAppData } from './app-data.ts';
import { createOnboarding } from './onboarding.ts';
import { HOST } from '../refs.ts';
import { filesystem } from './filesystem.ts';
import { createSettingsService } from './settings.ts';
import { createSettingsStore } from '../features/settings/be/store.ts';

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
  /** The app's registered packs (`createPackRegistry()`): packs read them through the SDK, the services reset them and apply their content */
  packs: PackRegistry;
  appVersion: string;
}

/** The running app as the SDK reaches it, which the composition root binds with `bindHost` */
export function createHostRuntime({ transport, appVersion, store, engine, packs }: HostRuntimeOptions): HostRuntime {
  const settings = createSettingsService(createSettingsStore({
    ears: () => engine.query,
    catalog: packs.settingsCatalog,
    onCatalogChanged: packs.onCatalogChanged,
  }));
  packs.catalog.setSettingsAdmission(candidate => compileSettingsCatalog(candidate).validate(settings.getOverrides()));
  return {
    transport,
    ears: engine.query,
    packs,
    appVersion,
    redaction: secretRedaction,
    services: {
      onboarding: createOnboarding(engine.query),
      // The service replaces the data; naming what the app is told about it belongs here, with the wiring
      appData: createAppData({ store, engine: engine.admin, registry: packs, settings,
        onReplaced: () => transport.rootEvents.emitIncoming({ to: HOST.bus, event: { type: 'DATA_REPLACED' } }),
      }),
      traceStore: createTraceStore(store),
      inference,
      secrets,
      filesystem,
      // All owners use the accepted declaration catalog.
      settings,
    },
  };
}
