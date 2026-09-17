// A test app: the pack's registered systems under the app's bus core, with a client the test drives.
import { createActor, type Actor, type AnyActorRef, type AnyStateMachine } from 'xstate';
import { createBusMachine } from '@abuddy/host/bus';
import type { PackBootHooks } from '@abuddy/sdk/framework';
import type { OutgoingSystemEvents } from '@abuddy/sdk/events';
import { testRootEvents } from '@abuddy/sdk/testing';
import { untypedQx } from '@abuddy/ears';
import { getDesignated, hasDesignation } from '@abuddy/sdk/designations';
import { ROOT_FLOW_ROLE } from '@abuddy/sdk/types';
import { stepRegistry } from '@abuddy/sdk/steps';

export type { OutgoingSystemEvents };

export interface StartAppOptions {
  /**
   * Registered systems to run, named as `sendToSystem` names them: the pack's own by feature id, a
   * dependency's as `<packId>/<featureId>` (full bus ids work too), or `'*'` for all.
   */
  systems: readonly string[] | '*';
}

/** A step a flow ran: its trace node (TNode) as it is in the database */
export interface FlowStepTrace {
  tNodeId: string;
  label: string;
  /** `step` or `flow` (a subflow) */
  tNodeType: string;
  status: string;
  /** The step's configuration and, once it ran, its `result` */
  nodeAttributes: Record<string, unknown>;
  /** The inputs the step resolved from the flow's event and earlier steps */
  params: Record<string, unknown>;
}

export interface RunFlowOptions {
  /** The event to send, as a client sends one to the brain; without one, the entry tracks the flow ran when it started */
  event?: string;
  /** The event's payload */
  data?: unknown;
  timeoutMs?: number;
}

export interface FlowRun {
  /** The trace nodes of the flow's tracks the event triggered */
  eventTNodeIds: string[];
  /** The steps those tracks ran, in the order they started */
  steps: FlowStepTrace[];
}

export interface TestApp {
  /** Sends CLIENT_CONNECTED, as a client connecting does; systems send their startup data */
  connect(): Promise<void>;
  /** Sends a system an event, as a client's `sendToSystem` does (the pack's own by feature id, a dependency's as `<packId>/<featureId>`) */
  send(systemId: string, event: { type: string; [key: string]: unknown }): Promise<void>;
  /** Events delivered to frontend plugins (by `emit` or `sendToPlugin`, once connected), in order; optionally one plugin's. Readable after `stop` */
  emitted(pluginId?: string): OutgoingSystemEvents[];
  /** The next event of `type` sent to `pluginId` that no earlier `nextEmit` returned, waiting for it if needed */
  nextEmit(pluginId: string, type: string, options?: { timeoutMs?: number }): Promise<OutgoingSystemEvents>;
  /** Resolves once the actors have no queued work left (zero-delay raises and settled promises included) */
  settle(): Promise<void>;
  /**
   * Runs an event through a running flow on the brain (the app's designated `brain` and `settings` systems must be
   * running), as the app does: the brain runs the root flow (`root: true`) and the subflows it spawns, and an event
   * reaches every running flow. Resolves once every track of the flow labelled `label` that the event triggered
   * has finished: its steps completed or failed, apart from steps that wait by design (keep-alive) and subflows
   * left only waiting. Without `event`, resolves with the entry tracks the flow ran when it started.
   *
   * It returns the tracks the event itself triggered. Tracks started by events those tracks send (a `fire` step,
   * `sendToBrainSystem`) aren't in the result: `settle()` after it, then read them with `flowTrace`. Sending `event`
   * connects the app first if needed; the app's bus drops events systems and steps send before a client connects,
   * as the app does at a cold boot, so call `connect()` right after `startApp` when entry tracks send events.
   */
  runFlow(label: string, options?: RunFlowOptions): Promise<FlowRun>;
  /** The steps a flow (the root flow or a subflow, by label) has run so far in this app. Readable after `stop` */
  flowTrace(label: string): FlowStepTrace[];
  /** A running system's actor */
  system(systemId: string): AnyActorRef;
  /**
   * Stops the systems and ends pending `nextEmit`/`runFlow` waits with an "app stopped" error; later calls (`connect`,
   * `send`, `nextEmit`, `settle`, `runFlow`, `system`) fail with it too. Once no app runs, it runs each registered
   * pack's `boot.onShutdown`, as the app does when it stops a pack, so state its modules keep outside the stopped
   * actors (schedules, listeners) doesn't reach the next test. The harness stops apps after each test.
   */
  stop(): void;
}

/** What test apps read of the test file's registered packs (host's PackRegistry, which the published declarations can't name) */
interface AppPacks {
  getBootHooks(): PackBootHooks[];
  resolveSystemAddress(address: string): string | undefined;
  getRegisteredSystems(): Map<string, AnyStateMachine>;
  getRegisteredPackSystemIds(packId: string): string[];
}

const running = new Set<TestApp>();
let registry: AppPacks | undefined;
let packId: string | undefined;

/** @internal The harness sets the registry apps run the systems of, and the pack's id, which its bare system ids map with */
export function setAppPacks(packs: AppPacks, id?: string): void {
  registry = packs;
  packId = id;
}

function packs(): AppPacks {
  if (!registry) throw new Error('Call setupPackTests() from a vitest setup file before startApp()');
  return registry;
}

/** @internal The harness stops apps a test left running; throws once all stopped if a pack's shutdown failed */
export function stopRunningApps(): void {
  const failures: unknown[] = [];
  for (const app of running) {
    try {
      app.stop();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) throw failures.length === 1 ? failures[0] : new AggregateError(failures, 'Stopping the test apps failed');
}

const describeError = (error: unknown) => error instanceof Error ? error.message : String(error);

/**
 * Runs each registered pack's `boot.onInit` in registration order (dependencies first), as the API does at boot
 * before it starts the systems. The first app of a test starts the packs and the last one to stop shuts them down,
 * so each test's apps run between one onInit and one onShutdown.
 */
function startPacks(): void {
  for (const boot of packs().getBootHooks()) {
    try {
      boot.onInit?.();
    } catch (error) {
      // As a failed boot: no app runs, so shut the packs down again for the next start
      let shutdown = '';
      try {
        shutDownPacks();
      } catch (shutdownError) {
        shutdown = ` Shutting the packs down after it failed too: ${describeError(shutdownError)}`;
      }
      throw new Error(`A pack's boot.onInit failed when the test app started: ${describeError(error)}.${shutdown}`, { cause: error });
    }
  }
}

/** Runs each registered pack's `boot.onShutdown`, as the app does when it stops a pack's systems */
function shutDownPacks(): void {
  const failures: string[] = [];
  for (const boot of packs().getBootHooks()) {
    try {
      boot.onShutdown?.();
    } catch (error) {
      failures.push(describeError(error));
    }
  }
  if (failures.length > 0) throw new Error(`A pack's boot.onShutdown failed when the test app stopped:\n  ${failures.join('\n  ')}`);
}

/**
 * The registered system a name addresses, as `sendToSystem` names it: a dependency's (or any pack's) system as
 * `<packId>/<featureId>`, the pack's own by feature id. A full bus id is accepted too.
 */
function resolveSystemId(id: string, registered: ReadonlyMap<string, AnyStateMachine>): string {
  const addressed = id.includes('/') ? packs().resolveSystemAddress(id) : packId && `${packId}.${id}`;
  if (addressed && registered.has(addressed)) return addressed;
  if (registered.has(id)) return id;
  throw new Error(`No registered system is named "${id}". Registered: ${[...registered.keys()].join(', ') || 'none'} (name the pack's own systems by feature id and a dependency's as "<packId>/<featureId>"; pass the pack's registration to setupPackTests)`);
}

/** One event loop turn, after zero-delay timers already queued (xstate's `raise(…, { delay: 0 })`) */
const macrotask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** The brain's trace node for the root flow (default-setup's brain repository) */
const ROOT_FLOW_TNODE = 'TNode-Root';

type TNodeSpawned = OutgoingSystemEvents & { type: 'TNODE_SPAWNED'; tNode: { id: string; label?: string; tNodeType?: string; eventType?: string }; flowTNodeId: string; eventTNodeId?: string };
type TNodeUpdated = OutgoingSystemEvents & { type: 'TNODE_UPDATED'; data: { tNodeId: string; status: string } };

const isSpawn = (event: OutgoingSystemEvents): event is TNodeSpawned => event.type === 'TNODE_SPAWNED';
const isUpdate = (event: OutgoingSystemEvents): event is TNodeUpdated => event.type === 'TNODE_UPDATED';

const readTNode = (id: string) => (untypedQx(id as never).pickAll() as Array<Record<string, unknown>>)[0];

function stepTrace(spawned: TNodeSpawned, lastSeen: ReadonlyMap<string, Record<string, unknown>>): FlowStepTrace {
  // The brain clears its trace nodes when it stops (its root flow finished): fall back to the row as last reported
  const row = readTNode(spawned.tNode.id) ?? lastSeen.get(spawned.tNode.id) ?? {};
  return {
    tNodeId: spawned.tNode.id,
    label: String(row.label ?? spawned.tNode.label ?? ''),
    tNodeType: String(row.tNodeType ?? spawned.tNode.tNodeType ?? ''),
    status: String(row.status ?? ''),
    nodeAttributes: (row.nodeAttributes as Record<string, unknown> | undefined) ?? {},
    params: (row.resolvedParams as Record<string, unknown> | undefined) ?? {},
  };
}
const SETTLE_LIMIT = 1000;

/** Starts the named registered systems under the bus. The harness stops it after the test. */
export async function startApp(options: StartAppOptions): Promise<TestApp> {
  const registered = packs().getRegisteredSystems();
  // In registration order, as the app spawns them (a pack's settings system before the systems that use it)
  const named = options.systems === '*' ? undefined : new Set(options.systems.map((id) => resolveSystemId(id, registered)));
  const systems = named ? new Map([...registered].filter(([id]) => named.has(id))) : registered;

  const emitted: OutgoingSystemEvents[] = [];
  const taken = new Set<number>();
  /** Pending waits for emitted events or trace reports: each checks again on every event, and ends when the app stops */
  const waits = new Set<{ attempt(): boolean; end(error: Error): void }>();
  const wakeWaits = () => { for (const wait of waits) wait.attempt(); };
  /** The brain's trace reports (TNODE_SPAWNED, TNODE_UPDATED), from its start: recorded before a client connects too */
  const reports: Array<TNodeSpawned | TNodeUpdated> = [];
  /** Trace node rows as they were when the brain last reported them */
  const tNodeRows = new Map<string, Record<string, unknown>>();
  /** The label of the flow each reported trace node ran in, kept after the brain clears its trace */
  const flowLabels = new Map<string, string>();
  const rootFlowLabel = () => (untypedQx().withRole(ROOT_FLOW_ROLE).pickAll() as Array<{ label?: string }>)[0]?.label;
  const record = (event: OutgoingSystemEvents) => {
    if (!isSpawn(event) && !isUpdate(event)) return;
    reports.push(event);
    const tNodeId = isSpawn(event) ? event.tNode.id : isUpdate(event) ? event.data.tNodeId : undefined;
    if (isSpawn(event)) {
      const flowLabel = event.flowTNodeId === ROOT_FLOW_TNODE ? rootFlowLabel() : flowLabels.get(`flow:${event.flowTNodeId}`);
      if (flowLabel !== undefined) flowLabels.set(event.tNode.id, flowLabel);
      if (event.tNode.tNodeType === 'flow') {
        // A subflow's trace node carries its step's label: the flow is the one that step runs (flowRef)
        const stepNodeId = (readTNode(event.tNode.id)?.blueprint as { nodeId?: string } | undefined)?.nodeId;
        const flowRef = stepNodeId === undefined ? undefined : readTNode(stepNodeId)?.flowRef;
        const subflowLabel = typeof flowRef === 'string' ? String(readTNode(flowRef)?.label ?? flowRef) : undefined;
        if (subflowLabel !== undefined) flowLabels.set(`flow:${event.tNode.id}`, subflowLabel);
      }
    }
    if (tNodeId) {
      // The update can arrive after the brain cleared the row: keep the reported status on the last row seen
      const row = readTNode(tNodeId) ?? tNodeRows.get(tNodeId) ?? {};
      tNodeRows.set(tNodeId, isUpdate(event) ? { ...row, status: event.data.status } : row);
    }
    wakeWaits();
  };
  /** Whether this app's bus routes events: a client connected since it started (CLIENT_CONNECTED reaches every running app) */
  const connected = () => bus.getSnapshot().matches('connected');
  /** Events for this app's systems sent before a client connected, which the bus dropped (as the app's does at a cold boot) */
  const dropped: string[] = [];
  const stopRecording = [
    testRootEvents.onOutgoing((event) => {
      emitted.push(event);
      wakeWaits();
    }),
    testRootEvents.onIncoming((event) => {
      if (!connected() && systems.has(event.systemId)) dropped.push(`${event.type}${typeof event.eventType === 'string' ? ` "${event.eventType}"` : ''} to ${event.systemId}`);
    }),
  ];
  const droppedNote = () => dropped.length === 0 ? '' :
    ` The bus dropped ${dropped.length} event(s) sent before the app connected: ${dropped.join(', ')}. Call app.connect() after startApp when entry tracks or schedules send events.`;

  const finished = (tNodeId: string) => reports.some((e) => isUpdate(e) && e.data.tNodeId === tNodeId && (e.data.status === 'completed' || e.data.status === 'failed'));
  const brainRunning = () => {
    const brainId = hasDesignation('brain') ? getDesignated('brain') : undefined;
    const brain = brainId === undefined ? undefined : bus.system.get(brainId);
    return (brain?.getSnapshot() as { matches(state: string): boolean } | undefined)?.matches('running') === true;
  };
  /** The running flows' trace nodes and labels: the root flow's, and each subflow's not yet finished */
  const runningFlows = (): Array<{ tNodeId: string; label: string }> => [
    ...(brainRunning() && rootFlowLabel() !== undefined ? [{ tNodeId: ROOT_FLOW_TNODE, label: rootFlowLabel()! }] : []),
    ...reports.filter(isSpawn).filter((e) => e.tNode.tNodeType === 'flow' && !finished(e.tNode.id))
      .map((e) => ({ tNodeId: e.tNode.id, label: flowLabels.get(`flow:${e.tNode.id}`) ?? '' })),
  ];
  const runningFlowTNodes = (label: string) => runningFlows().filter((flow) => flow.label === label).map((flow) => flow.tNodeId);
  const runningFlowLabels = () => runningFlows().map((flow) => flow.label);

  let activity = 0;
  let stopped = false;
  /** Whether the packs are up, so a start that failed before they were doesn't shut them down twice */
  let packsUp = false;
  const bus: Actor<ReturnType<typeof createBusMachine>> = createActor(createBusMachine({
    registry: packs(),
    systems: () => systems,
    onOutgoing: (event) => testRootEvents.emitOutgoing(event),
    listen: (send) => {
      const unsubscribes = [
        testRootEvents.onConnected(() => send({ type: 'CLIENT_CONNECTED' })),
        testRootEvents.onPackClientConnected((id) => send({ type: 'PACK_CLIENT_CONNECTED', packId: id })),
        testRootEvents.onIncoming((event) => send({ type: 'INCOMING', event })),
        testRootEvents.onPluginSend((event) => send({ type: 'OUTGOING', event })),
      ];
      return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    },
  }), {
    systemId: 'bus',
    inspect: (inspection) => {
      activity++;
      // What systems send the bus for clients, connected or not
      if (inspection.type === '@xstate.event' && inspection.event.type === 'OUTGOING' && inspection.actorRef === (inspection.actorRef as AnyActorRef).system.get('bus')) {
        record((inspection.event as unknown as { event: OutgoingSystemEvents }).event);
      }
    },
  });

  const stoppedError = () => new Error('The test app stopped (its test ended, or app.stop() ran) before this finished');
  /** Resolves with what `check` finds once an event makes it find something; rejects when the app stops first */
  const waitForEmitted = <T>(check: () => T | undefined, timeoutMs: number, describe: () => string) => new Promise<T>((resolve, reject) => {
    if (stopped) return reject(stoppedError());
    const end = (settleWait: () => void) => {
      clearTimeout(timer);
      waits.delete(wait);
      settleWait();
    };
    const wait = {
      attempt: () => {
        const found = check();
        if (found === undefined) return false;
        end(() => resolve(found));
        return true;
      },
      end: (error: Error) => end(() => reject(error)),
    };
    const timer = setTimeout(() => wait.end(new Error(describe())), timeoutMs);
    if (!wait.attempt()) waits.add(wait);
  });

  /**
   * The app's calls still running: a stop ends them, and nobody need await one after that. A call made after the stop
   * rejects the same way, and is handled too, so `void app.nextEmit(…)` after it isn't an unhandled rejection.
   */
  const calls = new Set<Promise<unknown>>();
  const call = <T>(run: () => Promise<T>): Promise<T> => {
    if (stopped) {
      const rejected = Promise.reject(stoppedError());
      rejected.catch(() => {});
      return rejected;
    }
    const promise = run().finally(() => calls.delete(promise));
    calls.add(promise);
    return promise;
  };

  /** Settles, or throws `timedOut()` once `deadline` passes first */
  const settle = async (deadline = Infinity, timedOut?: () => string) => {
    for (let ticks = 0; ticks < SETTLE_LIMIT; ticks++) {
      if (timedOut && Date.now() > deadline) throw new Error(timedOut());
      const before = activity;
      await macrotask();
      if (activity === before) return;
    }
    throw new Error(`The app didn't settle after ${SETTLE_LIMIT} event loop turns: a system keeps sending events`);
  };

  const app: TestApp = {
    connect: () => call(async () => {
      testRootEvents.emitConnected();
      await settle();
    }),
    send: (systemId, event) => call(async () => {
      if (!connected()) throw new Error('The bus routes client events only once connected: call app.connect() first');
      testRootEvents.emitIncoming({ ...event, systemId: resolveSystemId(systemId, systems) });
      await settle();
    }),
    emitted(pluginId) {
      return pluginId === undefined ? [...emitted] : emitted.filter((event) => event.pluginId === pluginId);
    },
    nextEmit: (pluginId, type, { timeoutMs = 5000 } = {}) => call(() => waitForEmitted(() => {
      const index = emitted.findIndex((event, i) => !taken.has(i) && event.pluginId === pluginId && event.type === type);
      if (index === -1) return undefined;
      taken.add(index);
      return emitted[index];
    }, timeoutMs, () => `No ${type} sent to ${pluginId} within ${timeoutMs}ms. Sent: ${emitted.map((e) => `${e.pluginId}:${e.type}`).join(', ') || 'nothing'}.${droppedNote()}`)),
    settle: () => call(() => settle()),
    runFlow: (label, { event, data, timeoutMs = 10_000 } = {}) => call(async () => {
      const brainId = hasDesignation('brain') ? getDesignated('brain') : undefined;
      const settingsId = hasDesignation('settings') ? getDesignated('settings') : undefined;
      if (!brainId || !settingsId || !systems.has(brainId) || !systems.has(settingsId)) {
        throw new Error("runFlow runs flows on the brain: start the app with the brain and settings systems, startApp({ systems: ['brain', 'settings', …] })");
      }
      const flows = untypedQx('Flow' as never).pickAll() as Array<{ label?: string }>;
      if (!flows.some((flow) => flow.label === label)) {
        throw new Error(`No flow "${label}". Flows: ${flows.map((flow) => flow.label).join(', ') || 'none (seed them first)'}`);
      }
      const flowTNodeIds = runningFlowTNodes(label);
      if (flowTNodeIds.length === 0) {
        const runningLabels = [...new Set(runningFlowLabels())];
        const ranAndFinished = reports.some((e) => isSpawn(e) && e.tNode.tNodeType === 'flow' && flowLabels.get(`flow:${e.tNode.id}`) === label);
        const why = ranAndFinished
          ? 'it ran and finished'
          : 'the brain runs the root flow (root: true) and the subflows running flows spawn: make it one of those, and import flows before startApp';
        throw new Error(`Flow "${label}" isn't running: ${why}. ${runningLabels.length > 0 ? `Running: ${runningLabels.join(', ')}` : 'No flow is running'}.${droppedNote()}`);
      }

      const eventType = event ?? 'flow.entry';
      const deadline = Date.now() + timeoutMs;
      // An event's tracks are the ones it triggers from here; entry tracks ran when the flow started
      const cursor = event === undefined ? 0 : reports.length;
      const since = () => reports.slice(cursor);
      const timedOut = () => `Flow "${label}" didn't finish "${eventType}" within ${timeoutMs}ms. Steps so far: ${since().filter(isSpawn).filter((e) => e.tNode.tNodeType !== 'event' && flowTNodeIds.includes(e.flowTNodeId)).map((e) => `${e.tNode.label} (${stepTrace(e, tNodeRows).status})`).join(', ') || 'none'}.${droppedNote()}`;
      if (event !== undefined) {
        if (!connected()) testRootEvents.emitConnected();
        testRootEvents.emitIncoming({ type: 'TRIGGER_BRAIN_EVENT', eventType: event, payload: data, systemId: brainId });
        await settle(deadline, timedOut);
      }

      const triggered = () => since().filter((e): e is TNodeSpawned =>
        isSpawn(e) && flowTNodeIds.includes(e.flowTNodeId) && e.tNode.tNodeType === 'event' && e.tNode.eventType === eventType);
      if (triggered().length === 0) {
        throw new Error(`Flow "${label}" has no track for "${eventType}".${droppedNote()}`);
      }
      const done = (id: string) => since().some((e) => isUpdate(e) && e.data.tNodeId === id && (e.data.status === 'completed' || e.data.status === 'failed'));
      /** Finished, or waiting by design: a waiting step, or a subflow whose own steps are all done or waiting */
      const settledNode = (spawned: TNodeSpawned): boolean => {
        if (done(spawned.tNode.id)) return true;
        if (spawned.tNode.tNodeType === 'flow') {
          const inner = since().filter((e): e is TNodeSpawned => isSpawn(e) && e.flowTNodeId === spawned.tNode.id && e.tNode.tNodeType !== 'event');
          return inner.length > 0 && inner.every(settledNode);
        }
        const stepType = (untypedQx(spawned.tNode.id as never).pickAll() as Array<{ stepNodeType?: string }>)[0]?.stepNodeType;
        return stepType !== undefined && stepRegistry.get(stepType)?.runtime?.waits === true;
      };
      const trackFinished = (eventTNodeId: string) =>
        done(eventTNodeId) || since().filter((e): e is TNodeSpawned => isSpawn(e) && e.eventTNodeId === eventTNodeId && e.tNode.id !== eventTNodeId).every(settledNode);
      const finishedTracks = () => {
        const ids = triggered().map((e) => e.tNode.id);
        return ids.every(trackFinished) ? ids : undefined;
      };
      let eventTNodeIds: string[] | undefined;
      // A step reports completion before its flow starts the next step, so every started step can look settled
      // in between: check again once the systems have settled
      while (!eventTNodeIds) {
        await waitForEmitted(finishedTracks, Math.max(deadline - Date.now(), 0), timedOut);
        await settle(deadline, timedOut);
        eventTNodeIds = finishedTracks();
      }
      const tracks = new Set(eventTNodeIds);
      return {
        eventTNodeIds,
        steps: since().filter(isSpawn).filter((e) => e.tNode.tNodeType !== 'event' && e.eventTNodeId !== undefined && tracks.has(e.eventTNodeId)).map((e) => stepTrace(e, tNodeRows)),
      };
    }),
    flowTrace(label) {
      return reports.filter(isSpawn)
        .filter((e) => e.tNode.tNodeType !== 'event' && flowLabels.get(e.tNode.id) === label)
        .map((e) => stepTrace(e, tNodeRows));
    },
    system(systemId) {
      if (stopped) throw stoppedError();
      const actor = bus.system.get(resolveSystemId(systemId, systems));
      if (!actor) throw new Error(`System "${systemId}" isn't running`);
      return actor;
    },
    stop() {
      if (!running.delete(app)) return;
      stopped = true;
      stopRecording.forEach((unsubscribe) => unsubscribe());
      bus.stop();
      // A call the stop ends rejects for whoever awaits it, and isn't an unhandled rejection when nobody does
      for (const pending of calls) pending.catch(() => {});
      for (const wait of waits) wait.end(stoppedError());
      // Pack modules keep state outside the stopped actors (schedules, listeners): process-wide, so once no app runs
      if (running.size === 0 && packsUp) shutDownPacks();
    },
  };

  // The app is registered before anything that can throw, so a failed start is still stopped: otherwise its
  // recorders stay subscribed to testRootEvents for the rest of the file, waking waits for a dead app.
  running.add(app);
  try {
    // `running` already holds this app, so a size of 1 means it's the first
    if (running.size === 1) startPacks();
    // Not before: startPacks shuts the packs down again itself when it fails, and stop() must not repeat it
    packsUp = true;
    bus.start();
    await settle();
  } catch (error) {
    app.stop();
    throw error;
  }
  return app;
}
