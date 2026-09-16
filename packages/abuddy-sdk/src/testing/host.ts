// The host modules a pack's systems, services and steps reach, in memory: what the app registers at
// boot (api/src/setup/sdk-host-init.ts), minus persistence, clients and the filesystem.
import { EventEmitter } from 'node:events';
import { registerHostModule, getHostModule } from '../runtime/host.ts';
import { initRpc, type RootEvents } from '../rpc/index.ts';
import type { EventTransport, IncomingSystemEvents, OutgoingSystemEvents } from '../events/index.ts';
import { getAllEntities, getAttr } from '../ears/attribute-storage.ts';
import { findRelations } from '../ears/relations.ts';
import type { EARS } from '../types/entities.ts';
import type { Logger } from '../ears/runtime.ts';
import type { LogEvent } from '../logger/index.ts';
import type { ReportSystemErrorInput } from '../utils/index.ts';
import type { AppDataService } from '../services/app-data.ts';
import type { TraceStore } from '../services/trace-store.ts';
import type { InferenceService } from '../services/inference.ts';
import type { SecretInfo, SecretProvider, SecretsService } from '../services/secrets.ts';
import { secretRules } from '../services/secrets-rules.ts';

/** The test app's root event bus: what clients (and the test) send the backend, and what it sends them */
export interface TestRootEvents extends RootEvents {
  emitConnected(): void;
  emitPackClientConnected(packId: string): void;
  emitIncoming(event: IncomingSystemEvents): void;
  onPackClientConnected(callback: (packId: string) => void): () => void;
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
  emitOutgoing(event: OutgoingSystemEvents): void { this.emit('outgoing', event); }
  onLog(callback: (event: LogEvent) => void): () => void { return this.subscribe('log', callback); }
  onConnected(callback: () => void): () => void { return this.subscribe('connected', callback); }
  onPackClientConnected(callback: (packId: string) => void): () => void { return this.subscribe('pack-connected', callback); }
  onIncoming(callback: (event: IncomingSystemEvents) => void): () => void { return this.subscribe('incoming', callback); }
  onOutgoing(callback: (event: OutgoingSystemEvents) => void): () => void { return this.subscribe('outgoing', callback); }
}

/** The root event bus the test host registers (`@abuddy/sdk/rpc`'s `rootEvents` once started) */
export const testRootEvents: TestRootEvents = new TestEventBus();

const systemErrors: ReportSystemErrorInput[] = [];

let testSecrets: SecretInfo[] = [];
let testSecretCount = 0;

/** Stores a key (no value: unit tests never reach a provider) as Settings → Secrets would; returns it */
export function addTestSecret(provider: SecretProvider, label: string): SecretInfo {
  const id = `Secret-test-${++testSecretCount}`;
  testSecrets = secretRules.add(testSecrets, { id, provider, label, createdAt: Date.now() });
  return testSecrets.find((secret) => secret.id === id)!;
}

/** @internal Empties the test host's stored keys */
export function resetTestSecrets(): void {
  testSecrets = [];
}

/** The user's keys in memory, keeping the host's rules */
const memorySecrets: SecretsService = {
  status: () => ({ protection: 'os-keystore', backend: 'memory' }),
  list: () => testSecrets.map((secret) => ({ ...secret })),
  select: (id) => { testSecrets = secretRules.select(testSecrets, id, Date.now()); },
  rename: (id, label) => { testSecrets = secretRules.rename(testSecrets, id, label, Date.now()); },
  delete: (id) => { testSecrets = secretRules.remove(testSecrets, id); },
};

/** Errors systems and steps reported with `reportSystemError` since the last call; clears them */
export function takeSystemErrors(): ReportSystemErrorInput[] {
  return systemErrors.splice(0);
}

function consoleLogger(source?: string): Logger {
  const prefix = source ? `[${source}]` : '[test]';
  return {
    debug: (...args: unknown[]) => console.debug(prefix, ...args),
    info: (...args: unknown[]) => console.info(prefix, ...args),
    warn: (...args: unknown[]) => console.warn(prefix, ...args),
    error: (...args: unknown[]) => console.error(prefix, ...args),
  };
}

const unmockedInference = () => Promise.reject(new Error(
  "No models in unit tests: mock inference with mockInference(reply) from @abuddy/testing/harness",
));

const unsupported = (name: string) => () => Promise.reject(new Error(`appData.${name} isn't supported in unit tests: there is no stored data to back up`));

/** Reads the in-memory database: unit tests keep flow execution records (TNodes) there */
const traceStore: TraceStore = {
  entities: () => getAllEntities().map((id) => ({ id, meta: entityMeta(id) })),
  getEntityMeta: (id) => (getAttr(id, 'entityType' as EARS.AttrKind) === null ? null : entityMeta(id)),
  getAttr: (kind, id) => getAttr(id, kind as EARS.AttrKind) ?? undefined,
  relations: (filter = {}) => findRelations({
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

function entityMeta(id: EARS.EntityId) {
  return { type: String(getAttr(id, 'entityType' as EARS.AttrKind) ?? id.slice(0, id.indexOf('-'))), createdAt: Number(getAttr(id, 'createdAt' as EARS.AttrKind) ?? 0) };
}

function registered(key: string): boolean {
  try {
    getHostModule(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Registers the in-memory host modules, each unless the host already registered one. `resetData`
 * backs `appData.reset`.
 */
export function registerTestHostModules(resetData: () => void): void {
  const modules: Record<string, unknown> = {
    'logger': { createLogger: consoleLogger, onLog: (callback: (event: LogEvent) => void) => testRootEvents.onLog(callback) },
    'bus-emitter': { rootEvents: testRootEvents },
    'event-transport': {
      sendIncoming: (event) => testRootEvents.emitIncoming(event),
      sendOutgoing: (event) => testRootEvents.emitOutgoing(event),
      onConnected: (callback) => testRootEvents.onConnected(callback),
      onIncoming: (callback) => testRootEvents.onIncoming(callback),
    } satisfies EventTransport,
    'system-errors': { reportSystemError: (input: ReportSystemErrorInput) => { systemErrors.push(input); } },
    'version': { APP_VERSION: '0.0.0-test' },
    'migrations': { runMigrations: () => {} },
    appData: {
      reset: async () => { resetData(); },
      exportBackup: unsupported('exportBackup'),
      importBackup: unsupported('importBackup'),
      backupInfo: async () => null,
    } satisfies AppDataService,
    traceStore,
    // No test reaches a provider: code calling a model fails until the test mocks inference
    inference: {
      generateText: unmockedInference, streamText: unmockedInference, createAgent: unmockedInference,
      embed: unmockedInference, embedMany: unmockedInference, generateImage: unmockedInference,
      generateSpeech: unmockedInference, transcribe: unmockedInference, rerank: unmockedInference,
    } satisfies Record<keyof InferenceService, unknown>,
    secrets: memorySecrets,
  };
  for (const [key, mod] of Object.entries(modules)) {
    if (!registered(key)) registerHostModule(key, mod);
  }
  initRpc();
}
