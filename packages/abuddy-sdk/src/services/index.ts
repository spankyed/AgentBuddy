import { getHostModule } from '../runtime/host.ts';
import { repository } from '../ears/index.ts';
import { sendToPlugin, sendToSystem, sendToBrainSystem } from '../events/index.ts';
import type { Logger } from '../ears/runtime.ts';
import { appData, type AppDataService } from './app-data.ts';
import { traceStore, type TraceStore } from './trace-store.ts';
import { inference, type InferenceService } from './inference.ts';
import { secrets, type SecretsService } from './secrets.ts';

export type { AppDataService, BackupDatabase, BackupInfo } from './app-data.ts';
export type { TraceStore, TraceEntityMeta, TraceRelation } from './trace-store.ts';
export { createInferenceService, type InferenceModels, type InferenceService, type OutputSchema, type OutputSpec, type ResolveModel } from './inference.ts';
export type { HostImplementedServices } from './host-services.ts';
export type { SecretInfo, SecretProvider, SecretsProtection, SecretsService, SecretsStatus } from './secrets.ts';
export { secretRules, secretProviderLabel, toSecretInfo } from './secrets-rules.ts';
export type { ModelId, ProviderName } from './models.ts';

function lazyHost(name: string) {
  let m: any;
  return () => m ??= getHostModule(name);
}

/** The host's pack registry, which holds the services each registered pack contributes. */
const packRegistry = lazyHost('pack-registry');

// --- Services aggregator ---
let _logger: Logger | undefined;
function logger() { return _logger ??= getHostModule<{ createLogger(source: string): Logger }>('logger').createLogger('log-service'); }

/**
 * Ambient services the host supplies to every action, alongside the services a
 * pack registers itself. Packs generate their `Services` type as
 * `typeof featureServices & HostServices`, so this stays the single definition
 * of what is injected.
 */
export interface HostServices {
  logger: Logger;
  /** Sends to plugins, systems and running flows, from `@abuddy/sdk/events`. A pack's `Services` types it with its own event maps. */
  emitter: {
    sendToPlugin: typeof sendToPlugin;
    sendToSystem: typeof sendToSystem;
    sendToBrainSystem: typeof sendToBrainSystem;
  };
  repository: typeof repository;
  /** Reset, back up and restore the app's stored data */
  appData: AppDataService;
  /** Read the volatile trace store (flow execution records) */
  traceStore: TraceStore;
  /** Model calls (text, agents, embeddings, images, speech, transcription, reranking) with the user's provider keys */
  inference: InferenceService;
  /** The user's API keys, without their values: list, select, rename, delete */
  secrets: SecretsService;
}

function resolveServices(): HostServices & Record<string, unknown> {
  return {
    logger: logger(),
    emitter: { sendToPlugin, sendToSystem, sendToBrainSystem },
    repository,
    appData,
    traceStore,
    inference,
    secrets,
    ...packRegistry().getRegisteredServices(),
  };
}

/**
 * Host services plus every registered pack service. Untyped beyond HostServices: a pack's
 * `#generated/services` exports `services` typed with its own and its dependencies' services.
 */
export const services: HostServices & Record<string, unknown> = new Proxy({} as HostServices & Record<string, unknown>, {
  get(_, prop: string) { return resolveServices()[prop]; },
  ownKeys() { return Reflect.ownKeys(resolveServices()); },
  getOwnPropertyDescriptor(_, prop) {
    const s = resolveServices();
    if (prop in s) return { configurable: true, enumerable: true, value: s[prop as string] };
  },
});

// --- Thread teardown ---
const teardowns: ((threadId: string) => void)[] = [];

export function registerThreadTeardown(fn: (threadId: string) => void): void {
  teardowns.push(fn);
}

export function runThreadTeardown(threadId: string): void {
  for (const fn of teardowns) {
    try { fn(threadId); } catch { /* already gone */ }
  }
}
