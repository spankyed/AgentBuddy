import type { repository } from '@abuddy/ears';
import { boundHost, type HostRuntimeServices } from '../runtime/host-runtime.ts';
import { sendToPlugin, sendToSystem, sendToBrainSystem } from '../events/index.ts';
import { createLogger, type Logger } from '../logger/logger.ts';
import type { AppDataService } from './app-data.ts';
import type { TraceStore } from './trace-store.ts';
import type { InferenceService } from './inference.ts';
import type { SecretsService } from './secrets.ts';

export type { AppDataService, BackupDatabase, BackupInfo } from './app-data.ts';
export type { TraceStore, TraceEntityMeta, TraceRelation } from './trace-store.ts';
export { createInferenceService, type InferenceModels, type InferenceService, type OutputSchema, type OutputSpec, type ResolveModel } from './inference.ts';
export type { SecretInfo, SecretProvider, SecretsProtection, SecretsService, SecretsSnapshot, SecretsStatus } from './secrets.ts';
export { secretRules, secretProviderLabel, toSecretInfo } from './secrets-rules.ts';
export type { ModelId, ProviderName } from './models.ts';

const logger = createLogger('log-service');

/**
 * Ambient services the host supplies to every action, alongside the services a
 * pack registers itself. Packs generate their `Services` type as
 * `typeof featureServices & HostServices`, so this stays the single definition
 * of what is injected.
 */
export interface HostServices {
  logger: Logger;
  /**
   * Sends to plugins, systems and running flows. Actions run outside any pack, so `sendToSystem` names a
   * system `<packId>/<featureId>`. A pack's `Services` types it with its own and its dependencies' events.
   */
  emitter: {
    sendToPlugin: typeof sendToPlugin;
    sendToSystem: typeof sendToSystem;
    sendToBrainSystem: typeof sendToBrainSystem;
  };
  repository: typeof repository;
  /** Reset, back up and restore the app's stored data; whether the user finished onboarding */
  appData: AppDataService;
  /** Read the volatile trace store (flow execution records) */
  traceStore: TraceStore;
  /** Model calls (text, agents, embeddings, images, speech, transcription, reranking) with the user's provider keys */
  inference: InferenceService;
  /** The user's API keys, without their values: list, select, rename, delete */
  secrets: SecretsService;
}

/** Sends to the system a `<packId>/<featureId>` name addresses, whatever id it runs under */
function sendToAddressedSystem(address: string, event: { type: string; [key: string]: unknown }): void {
  const systemId = boundHost().packs.resolveSystemAddress(address);
  if (!systemId) {
    throw new Error(`No running system is named "${address}": services.emitter.sendToSystem takes "<packId>/<featureId>"`);
  }
  sendToSystem(systemId, event);
}

const emitter: HostServices['emitter'] = { sendToPlugin, sendToSystem: sendToAddressedSystem, sendToBrainSystem };

/** The bound app's implementation of a service; each call reads the binding */
const app = <K extends keyof HostRuntimeServices>(name: K): HostRuntimeServices[K] => boundHost().services[name];

const appData: AppDataService = {
  reset: () => app('appData').reset(),
  hasOnboarded: () => app('appData').hasOnboarded(),
  completeOnboarding: () => app('appData').completeOnboarding(),
  exportBackup: (targetPath, name, databases) => app('appData').exportBackup(targetPath, name, databases),
  importBackup: (backupPath) => app('appData').importBackup(backupPath),
  backupInfo: (backupPath) => app('appData').backupInfo(backupPath),
};

const traceStore: TraceStore = {
  entities: () => app('traceStore').entities(),
  getEntityMeta: (id) => app('traceStore').getEntityMeta(id),
  getAttr: (kind, id) => app('traceStore').getAttr(kind, id),
  relations: (filter) => app('traceStore').relations(filter),
};

const inference: InferenceService = {
  generateText: (options) => app('inference').generateText(options),
  streamText: (options) => app('inference').streamText(options),
  createAgent: (settings) => app('inference').createAgent(settings),
  embed: (options) => app('inference').embed(options),
  embedMany: (options) => app('inference').embedMany(options),
  generateImage: (options) => app('inference').generateImage(options),
  generateSpeech: (options) => app('inference').generateSpeech(options),
  transcribe: (options) => app('inference').transcribe(options),
  rerank: (options) => app('inference').rerank(options),
};

const secrets: SecretsService = {
  status: () => app('secrets').status(),
  list: () => app('secrets').list(),
  select: (id) => app('secrets').select(id),
  rename: (id, label) => app('secrets').rename(id, label),
  delete: (id) => app('secrets').delete(id),
};

/**
 * The services the SDK builds (logger, emitter, repository from the bound engine), the app's four, and every
 * registered pack's. Reading them needs a bound app; the app's four are delegates that read it on each call.
 */
function resolveServices(): HostServices & Record<string, unknown> {
  const runtime = boundHost();
  return {
    logger,
    emitter,
    repository: runtime.ears.repository,
    appData,
    traceStore,
    inference,
    secrets,
    ...runtime.packs.getRegisteredServices(),
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
