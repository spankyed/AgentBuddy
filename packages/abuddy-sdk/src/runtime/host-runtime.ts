// The one port between the SDK and the app it runs in: the resources a running app owns, bound once per
// process. Behaviour over them (sends, logging, error reports, `services`) is SDK code.
import { installEngine, type EarsQuery } from '@abuddy/ears';
import type { RootEvents } from './root-events.ts';
import type { AppDataService } from '../services/app-data.ts';
import type { TraceStore } from '../services/trace-store.ts';
import type { InferenceService } from '../services/inference.ts';
import type { SecretsService } from '../services/secrets.ts';
import type { FilesystemService } from '../services/filesystem.ts';
import type { PackRegistryView } from './packs-view.ts';

/** The app's EARS engine, as packs query it: its query face (`createEarsEngine` from `@abuddy/ears`) */
export type { EarsQuery } from '@abuddy/ears';

/** What the app implements and packs call through `services` */
export interface HostRuntimeServices {
  /** Reset, back up and restore the app's stored data */
  appData: AppDataService;
  /** The volatile trace store (flow execution records) */
  traceStore: TraceStore;
  /** Model calls with the user's provider keys */
  inference: InferenceService;
  /** The user's API keys, as metadata */
  secrets: SecretsService;
  /** Files and folders on the user's disk */
  filesystem: FilesystemService;
}

/** The running app, as the SDK reaches it in a backend process */
export interface HostRuntime {
  /** The app's event bus */
  transport: { rootEvents: RootEvents };
  /** The app's engine, its query face: binding installs it for `@abuddy/ears`'s free functions */
  ears: EarsQuery;
  /** The registered packs, read-only: their services and everything else they registered */
  packs: PackRegistryView;
  /** The running app's version (`getAppVersion()`) */
  appVersion: string;
  /** The services packs call that the app implements */
  services: HostRuntimeServices;
}

let bound: HostRuntime | undefined;

/** Binds the running app, and installs its engine (`installEngine(runtime.ears)`); once per process */
export function bindHost(runtime: HostRuntime): void {
  if (bound) throw new Error('A host is already bound in this process: bindHost runs once, at boot');
  bound = runtime;
  installEngine(runtime.ears);
}

/** @internal Tests only: forgets the bound app and uninstalls its engine, so a test can bind another */
export function unbindHost(): void {
  bound = undefined;
  installEngine(undefined);
}

/** @internal Whether an app is bound */
export function isHostBound(): boolean {
  return bound !== undefined;
}

/** @internal The bound app; throws, naming bindHost, when none is */
export function boundHost(): HostRuntime {
  if (!bound) {
    throw new Error('No host is bound: the app binds one at boot with bindHost(runtime) from @abuddy/sdk/runtime, and unit tests with startTestRuntime() from @abuddy/sdk/testing');
  }
  return bound;
}
