import { getHostModule } from '../runtime/host.ts';
import { repository } from '../ears/index.ts';
import type { EARS } from '../types/entities.ts';
import { emit, type PluginEvents, type TypedEmit } from '../helpers/actor-helpers.ts';
import type { Logger } from '../ears/runtime.ts';
import type { ApplicationHotkeys } from '../types/index.ts';
import { appData, traceStore, type AppDataService, type TraceStore } from './data.ts';
import { inference, type InferenceService } from './inference-service.ts';

export type { AppDataService, BackupDatabase, BackupInfo, TraceStore, TraceEntityMeta, TraceRelation } from './data.ts';
export { toAiOutput, type InferenceService, type OutputOf, type OutputSpec } from './inference-service.ts';
export type { ModelId, ProviderName } from './models.ts';

function lazyHost(name: string) {
  let m: any;
  return () => m ??= getHostModule(name);
}

// --- Event emitter (host-injected) ---
const emitter = lazyHost('event-emitter');
/** The host's pack registry, which holds the services each registered pack contributes. */
const packRegistry = lazyHost('pack-registry');

/** `sendToPlugin` typed against a plugin event map (see `#generated/events`). */
export type TypedSendToPlugin<M extends PluginEvents> = <P extends keyof M & string>(pluginId: P, event: M[P]) => void;

/** Any plugin, any event with a `type`. Packs use the typed one from `defineEvents` (their `#generated/events`). */
export function sendToPlugin(pluginId: string, event: { type: string; [key: string]: unknown }): void {
  emitter().sendToPlugin(pluginId, event);
}

export interface TypedEvents<M extends PluginEvents> {
  emit: TypedEmit<M>;
  sendToPlugin: TypedSendToPlugin<M>;
}

/**
 * `emit` and `sendToPlugin` typed against a pack's plugin event map. `abuddy generate-entries`
 * writes `#generated/events` with `defineEvents<PackEvents>()`; the functions are the SDK's.
 */
export function defineEvents<M extends PluginEvents>(): TypedEvents<M> {
  return { emit, sendToPlugin } as unknown as TypedEvents<M>;
}

/**
 * Events the host app's own plugins receive from pack systems. A pack system declares a send
 * to one with `features[].system.sendsTo` in abuddy.json; `#generated/events` includes this map.
 */
export type HostPluginEvents = {
  application:
    | { type: 'APPLICATION_HOTKEYS'; hotkeys: ApplicationHotkeys }
    | { type: 'APPLICATION_RESTORE_LAST_PLUGIN'; lastActivePluginId: string }
    | { type: 'PLUGIN_VISIBILITY_UPDATED'; pluginVisibility: Record<string, boolean> };
};

export function sendToBrainSystem(event: {
  eventType: string;
  payload?: unknown;
  targetFlowId?: EARS.EntityId;
}): void {
  emitter().sendToBrainSystem(event);
}

export function sendToSystem(systemId: string, event: { type: string; [key: string]: unknown }): void {
  emitter().sendToSystem(systemId, event);
}

export function onOutgoing(callback: (event: { type: string; [key: string]: unknown }) => void): () => void {
  return emitter().onOutgoing(callback);
}

export function onIncoming(callback: (event: { type: string; [key: string]: unknown }) => void): () => void {
  return emitter().onIncoming(callback);
}

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
  emitter: {
    sendToPlugin: typeof sendToPlugin;
    sendToBrainSystem: typeof sendToBrainSystem;
    sendToSystem: typeof sendToSystem;
    onOutgoing: typeof onOutgoing;
    onIncoming: typeof onIncoming;
  };
  repository: typeof repository;
  /** Reset, back up and restore the app's stored data */
  appData: AppDataService;
  /** Read the volatile trace store (flow execution records) */
  traceStore: TraceStore;
  /** Model calls (`generateText`, `streamText`) with the user's provider keys */
  inference: InferenceService;
}

function resolveServices(): HostServices & Record<string, unknown> {
  return {
    logger: logger(),
    emitter: { sendToPlugin, sendToBrainSystem, sendToSystem, onOutgoing, onIncoming },
    repository,
    appData,
    traceStore,
    inference,
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
