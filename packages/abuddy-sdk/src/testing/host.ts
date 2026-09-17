// The app a pack's systems, services and steps reach in unit tests, in memory: what the app binds at boot
// (openAppStore() in api/src/setup/backend.ts), minus persistence, clients and the filesystem.
import { EventEmitter } from 'node:events';
import { bindHost, type HostRuntime } from '../runtime/host-runtime.ts';
import type { PackRegistryView } from '../runtime/packs-view.ts';
import { testPacksView } from './packs.ts';
import type { RootEvents } from '../runtime/root-events.ts';
import type { IncomingSystemEvents, OutgoingSystemEvents } from '../events/index.ts';
import type { EarsEngine } from '@abuddy/ears';
import type { EARS } from '../types/entities.ts';
import type { LogEvent, SystemErrorEvent } from '../logger/index.ts';
import type { TraceStore } from '../services/trace-store.ts';
import type { AppDataService } from '../services/app-data.ts';
import type { SecretInfo, SecretProvider, SecretsService } from '../services/secrets.ts';
import { secretRules } from '../services/secrets-rules.ts';

/** The test app's root event bus: what clients (and the test) send the backend, and what it sends them */
export interface TestRootEvents extends RootEvents {
  emitConnected(): void;
  emitPackClientConnected(packId: string): void;
}

class TestEventBus extends EventEmitter implements TestRootEvents {
  private subscribe<A extends unknown[]>(name: string, callback: (...args: A) => void): () => void {
    const listener = (...args: unknown[]) => callback(...(args as A));
    this.on(name, listener);
    return () => { this.off(name, listener); };
  }

  emitLog(event: LogEvent): void { this.emit('log', event); }
  emitConnected(): void { this.emit('connected'); }
  emitPackClientConnected(packId: string): void { this.emit('pack-connected', packId); }
  emitIncoming(event: IncomingSystemEvents): void { this.emit('incoming', event); }
  emitPluginSend(event: OutgoingSystemEvents): void { this.emit('plugin-send', event); }
  emitOutgoing(event: OutgoingSystemEvents): void { this.emit('outgoing', event); }
  onLog(callback: (event: LogEvent) => void): () => void { return this.subscribe('log', callback); }
  onConnected(callback: () => void): () => void { return this.subscribe('connected', callback); }
  onPackClientConnected(callback: (packId: string) => void): () => void { return this.subscribe('pack-connected', callback); }
  onIncoming(callback: (event: IncomingSystemEvents) => void): () => void { return this.subscribe('incoming', callback); }
  onPluginSend(callback: (event: OutgoingSystemEvents) => void): () => void { return this.subscribe('plugin-send', callback); }
  onOutgoing(callback: (event: OutgoingSystemEvents) => void): () => void { return this.subscribe('outgoing', callback); }
}

/** The in-memory app's bus (the SDK's internal `rootEvents` once started) */
export const testRootEvents: TestRootEvents = new TestEventBus();

const systemErrors: SystemErrorEvent[] = [];

let testSecrets: SecretInfo[] = [];
let testSecretCount = 0;

/** Stores a key (no value: unit tests never reach a provider) as Settings → Secrets would; returns it */
export function addTestSecret(provider: SecretProvider, label: string): SecretInfo {
  const id = `Secret-test-${++testSecretCount}`;
  testSecrets = secretRules.add(testSecrets, { id, provider, label, createdAt: Date.now() });
  return testSecrets.find((secret) => secret.id === id)!;
}

/** Whether the test app's user finished onboarding, unless the test app is given where the app keeps it */
let onboarded = false;

/** Where the test app keeps whether the user finished onboarding */
export type TestOnboarding = Pick<AppDataService, 'hasOnboarded' | 'completeOnboarding'>;

const memoryOnboarding: TestOnboarding = {
  hasOnboarded: () => onboarded,
  completeOnboarding: () => { onboarded = true; },
};

/** @internal Empties the test host's stored keys and starts onboarding over */
export function resetTestHostState(): void {
  testSecrets = [];
  onboarded = false;
}

/** The user's keys in memory, keeping the host's rules */
const memorySecrets: SecretsService = {
  status: () => ({ protection: 'os-keystore', backend: 'memory' }),
  list: () => testSecrets.map((secret) => ({ ...secret })),
  select: (id) => { testSecrets = secretRules.select(testSecrets, id, Date.now()); },
  rename: (id, label) => { testSecrets = secretRules.rename(testSecrets, id, label, Date.now()); },
  delete: (id) => { testSecrets = secretRules.remove(testSecrets, id); },
};

/** The SYSTEM_ERROR events systems reported with `reportError` (without `step`) since the last call; clears them */
export function takeSystemErrors(): SystemErrorEvent[] {
  return systemErrors.splice(0);
}

const unmockedInference = () => Promise.reject(new Error(
  "No models in unit tests: mock inference with mockInference(reply) from @abuddy/testing/harness",
));

const unsupported = (name: string) => () => Promise.reject(new Error(`appData.${name} isn't supported in unit tests: there is no stored data to back up`));

/** Reads the in-memory database: unit tests keep flow execution records (TNodes) there */
function memoryTraceStore(engine: () => EarsEngine): TraceStore {
  const getAttr = (id: EARS.EntityId, kind: string) => engine().query.getAttr(id, kind as EARS.AttrKind);
  const entityMeta = (id: EARS.EntityId) =>
    ({ type: String(getAttr(id, 'entityType') ?? id.slice(0, id.indexOf('-'))), createdAt: Number(getAttr(id, 'createdAt') ?? 0) });
  return {
    entities: () => engine().query.getAllEntities().map((id) => ({ id, meta: entityMeta(id) })),
    getEntityMeta: (id) => (getAttr(id, 'entityType') === null ? null : entityMeta(id)),
    getAttr: (kind, id) => getAttr(id, kind) ?? undefined,
    relations: (filter = {}) => engine().query.findRelations({
      ...(filter.kind && { relationType: filter.kind as EARS.RelKind }),
      ...(filter.src && { sourceEntity: filter.src }),
      ...(filter.tgt && { targetEntity: filter.tgt }),
    })
      .slice(0, filter.limit)
      .map((relation) => ({
        id: relation.id,
        rel: { kind: relation.relationType, src: relation.sourceEntity, tgt: relation.targetEntity, info: relation.info, createdAt: 0 },
      })),
  };
}

/** Prints a log event as the app's log capture does: `[source] message meta` */
function printLogEvent(event: LogEvent): void {
  console[event.level](event.source ? `[${event.source}]` : '[test]', event.message, ...(event.meta === undefined ? [] : [event.meta]));
}

export interface TestRuntimeOptions {
  /** The in-memory engine, which a reset replaces */
  engine: () => EarsEngine;
  /** Backs `appData.reset` */
  resetData: () => void;
  /** The registered packs the SDK's lookups read, under `testPacks`; none by default */
  packs?: PackRegistryView;
  /** `getAppVersion()`; `0.0.0-test` by default */
  appVersion?: string;
  /** Backs `appData.hasOnboarded` and `completeOnboarding`; in memory by default, emptied with the database */
  onboarding?: TestOnboarding;
}

/**
 * The in-memory app: `testRootEvents` as its bus (whose log events it prints, and whose SYSTEM_ERROR events it
 * records for `takeSystemErrors`), the in-memory engine, `testPacks` over `packs`, and the app's services in memory.
 */
export function bindTestRuntime({ engine, resetData, packs, appVersion = '0.0.0-test', onboarding = memoryOnboarding }: TestRuntimeOptions): HostRuntime {
  const runtime: HostRuntime = {
    transport: { rootEvents: testRootEvents },
    // The current engine: a reset replaces it
    get ears() { return engine().query; },
    packs: testPacksView(packs),
    appVersion,
    services: {
      appData: {
        reset: async () => { resetData(); },
        hasOnboarded: () => onboarding.hasOnboarded(),
        completeOnboarding: () => onboarding.completeOnboarding(),
        exportBackup: unsupported('exportBackup'),
        importBackup: unsupported('importBackup'),
        backupInfo: async () => null,
      },
      traceStore: memoryTraceStore(engine),
      // No test reaches a provider: code calling a model fails until the test mocks inference
      inference: {
        generateText: unmockedInference, streamText: unmockedInference, createAgent: unmockedInference,
        embed: unmockedInference, embedMany: unmockedInference, generateImage: unmockedInference,
        generateSpeech: unmockedInference, transcribe: unmockedInference, rerank: unmockedInference,
      },
      secrets: memorySecrets,
    },
  };
  bindHost(runtime);
  testRootEvents.onLog(printLogEvent);
  testRootEvents.onOutgoing((event) => {
    if (event.type === 'SYSTEM_ERROR') systemErrors.push(event as unknown as SystemErrorEvent);
  });
  return runtime;
}
