// A test app: the pack's registered systems under the app's bus core, with a client the test drives.
import { createActor, type Actor, type AnyActorRef, type AnyStateMachine } from 'xstate';
import { createBusMachine, type OutgoingSystemEvents } from '@abuddy/host/bus';
import { getRegisteredSystems } from '@abuddy/host/packs';
import { testRootEvents } from '@abuddy/sdk/testing';

export type { OutgoingSystemEvents };

export interface StartAppOptions {
  /**
   * Registered systems to run: bare feature ids (the pack's own map to `<packId>.<featureId>`) or full
   * bus ids, or `'*'` for all.
   */
  systems: readonly string[] | '*';
}

export interface TestApp {
  /** Sends CLIENT_CONNECTED, as a client connecting does; systems send their startup data */
  connect(): Promise<void>;
  /** Sends a system an event, as a client's `trpc.bus.send` does */
  send(systemId: string, event: { type: string; [key: string]: unknown }): Promise<void>;
  /** Events sent to frontend plugins (by `emit` or `sendToPlugin`), in order; optionally one plugin's */
  emitted(pluginId?: string): OutgoingSystemEvents[];
  /** The next event of `type` sent to `pluginId` that no earlier `nextEmit` returned, waiting for it if needed */
  nextEmit(pluginId: string, type: string, options?: { timeoutMs?: number }): Promise<OutgoingSystemEvents>;
  /** Resolves once the actors have no queued work left (zero-delay raises and settled promises included) */
  settle(): Promise<void>;
  /** A running system's actor */
  system(systemId: string): AnyActorRef;
  stop(): void;
}

const running = new Set<TestApp>();
let packId: string | undefined;

/** @internal The harness sets the pack's id, which its bare system ids map with */
export function setAppPackId(id: string): void {
  packId = id;
}

/** @internal The harness stops apps a test left running */
export function stopRunningApps(): void {
  for (const app of running) app.stop();
}

function resolveSystemId(id: string, registered: ReadonlyMap<string, AnyStateMachine>): string {
  if (registered.has(id)) return id;
  const prefixed = packId && `${packId}.${id}`;
  if (prefixed && registered.has(prefixed)) return prefixed;
  throw new Error(`No registered system "${id}"${prefixed ? ` or "${prefixed}"` : ''}. Registered: ${[...registered.keys()].join(', ') || 'none'} (pass the pack's registration to setupPackTests)`);
}

const macrotask = () => new Promise<void>((resolve) => setImmediate(resolve));
const SETTLE_LIMIT = 1000;

/** Starts the named registered systems under the bus. The harness stops it after the test. */
export async function startApp(options: StartAppOptions): Promise<TestApp> {
  const registered = getRegisteredSystems();
  const systems = options.systems === '*'
    ? registered
    : new Map(options.systems.map((id) => {
      const busId = resolveSystemId(id, registered);
      return [busId, registered.get(busId)!] as const;
    }));

  const emitted: OutgoingSystemEvents[] = [];
  const taken = new Set<number>();
  const waiters = new Set<() => void>();
  const stopRecording = testRootEvents.onOutgoing((event) => {
    emitted.push(event);
    for (const wake of waiters) wake();
  });

  let activity = 0;
  let connected = false;
  const bus: Actor<ReturnType<typeof createBusMachine>> = createActor(createBusMachine({
    systems: () => systems,
    onOutgoing: (event) => testRootEvents.emitOutgoing(event),
    listen: (send) => {
      const unsubscribes = [
        testRootEvents.onConnected(() => send({ type: 'CLIENT_CONNECTED' })),
        testRootEvents.onPackClientConnected((id) => send({ type: 'PACK_CLIENT_CONNECTED', packId: id })),
        testRootEvents.onIncoming((event) => send({ type: 'INCOMING', event })),
      ];
      return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    },
  }), { systemId: 'bus', inspect: () => { activity++; } });

  const settle = async () => {
    for (let ticks = 0; ticks < SETTLE_LIMIT; ticks++) {
      const before = activity;
      await macrotask();
      if (activity === before) return;
    }
    throw new Error(`The app didn't settle after ${SETTLE_LIMIT} event loop turns: a system keeps sending events`);
  };

  const app: TestApp = {
    async connect() {
      connected = true;
      testRootEvents.emitConnected();
      await settle();
    },
    async send(systemId, event) {
      if (!connected) throw new Error('The bus routes client events only once connected: call app.connect() first');
      testRootEvents.emitIncoming({ ...event, systemId: resolveSystemId(systemId, systems) });
      await settle();
    },
    emitted(pluginId) {
      return pluginId === undefined ? [...emitted] : emitted.filter((event) => event.pluginId === pluginId);
    },
    nextEmit(pluginId, type, { timeoutMs = 5000 } = {}) {
      const find = () => emitted.findIndex((event, index) => !taken.has(index) && event.pluginId === pluginId && event.type === type);
      return new Promise((resolve, reject) => {
        const check = () => {
          const index = find();
          if (index === -1) return false;
          taken.add(index);
          waiters.delete(wake);
          clearTimeout(timer);
          resolve(emitted[index]);
          return true;
        };
        const wake = () => { check(); };
        const timer = setTimeout(() => {
          waiters.delete(wake);
          reject(new Error(`No ${type} sent to ${pluginId} within ${timeoutMs}ms. Sent: ${emitted.map((e) => `${e.pluginId}:${e.type}`).join(', ') || 'nothing'}`));
        }, timeoutMs);
        if (!check()) waiters.add(wake);
      });
    },
    settle,
    system(systemId) {
      const actor = bus.system.get(resolveSystemId(systemId, systems));
      if (!actor) throw new Error(`System "${systemId}" isn't running`);
      return actor;
    },
    stop() {
      if (!running.delete(app)) return;
      stopRecording();
      bus.stop();
    },
  };

  running.add(app);
  bus.start();
  await settle();
  return app;
}
