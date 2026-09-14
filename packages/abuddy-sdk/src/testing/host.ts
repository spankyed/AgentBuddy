// The host modules a pack's systems, services and steps reach, in memory: what the app registers at
// boot (api/src/setup/sdk-host-init.ts), minus persistence, clients and the filesystem.
import { EventEmitter } from 'node:events';
import { registerHostModule, getHostModule } from '../runtime/host.ts';
import { initRpc, type IncomingSystemEvents, type OutgoingSystemEvents, type RootEvents } from '../rpc/index.ts';
import { getDesignated } from '../designations/index.ts';
import { getAllEntities, getAttr } from '../ears/attribute-storage.ts';
import { findRelations } from '../ears/relations.ts';
import type { EARS } from '../types/entities.ts';
import type { Logger } from '../ears/runtime.ts';
import type { LogEvent } from '../logger/index.ts';
import type { ReportSystemErrorInput } from '../utils/index.ts';
import type { AppDataService, TraceStore } from '../services/data.ts';
import { restoreModelProvider } from './fake-model.ts';

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
    'logger': { createLogger: consoleLogger },
    'bus-emitter': { rootEvents: testRootEvents },
    'event-emitter': {
      sendToPlugin: (pluginId: string, event: { type: string }) => testRootEvents.emitOutgoing({ ...event, pluginId }),
      sendToSystem: (systemId: string, event: { type: string }) => testRootEvents.emitIncoming({ ...event, systemId }),
      sendToBrainSystem: (event: { eventType: string; payload?: unknown; targetFlowId?: EARS.EntityId }) =>
        testRootEvents.emitIncoming({ ...event, type: 'TRIGGER_BRAIN_EVENT', systemId: getDesignated('brain') }),
      onOutgoing: (callback: (event: OutgoingSystemEvents) => void) => testRootEvents.onOutgoing(callback),
      onIncoming: (callback: (event: IncomingSystemEvents) => void) => testRootEvents.onIncoming(callback),
    },
    'system-errors': { reportSystemError: (input: ReportSystemErrorInput) => { systemErrors.push(input); } },
    'version': { APP_VERSION: '0.0.0-test' },
    'migrations': { runMigrations: () => {} },
    'app-data': {
      reset: async () => { resetData(); },
      exportBackup: unsupported('exportBackup'),
      importBackup: unsupported('importBackup'),
      backupInfo: async () => null,
    } satisfies AppDataService,
    'trace-store': traceStore,
  };
  for (const [key, mod] of Object.entries(modules)) {
    if (!registered(key)) registerHostModule(key, mod);
  }
  // No test reaches a real model: until one calls fakeModel(), inference fails naming it
  restoreModelProvider();
  initRpc();
}
