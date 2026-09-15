// A test app: the pack's registered systems under the app's bus core, with a client the test drives.
import { createActor, type Actor, type AnyActorRef, type AnyStateMachine } from 'xstate';
import { createBusMachine, type OutgoingSystemEvents } from '@abuddy/host/bus';
import { getRegisteredSystems } from '@abuddy/host/packs';
import { testRootEvents } from '@abuddy/sdk/testing';
import { untypedQx } from '@abuddy/sdk/ears';
import { getDesignated, hasDesignation } from '@abuddy/sdk/designations';
import { ROOT_FLOW_ROLE } from '@abuddy/sdk/types';
import { stepRegistry } from '@abuddy/sdk/steps';

export type { OutgoingSystemEvents };

export interface StartAppOptions {
  /**
   * Registered systems to run: bare feature ids (the pack's own map to `<packId>.<featureId>`) or full
   * bus ids, or `'*'` for all.
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
  /** Sends a system an event, as a client's `trpc.bus.send` does */
  send(systemId: string, event: { type: string; [key: string]: unknown }): Promise<void>;
  /** Events sent to frontend plugins (by `emit` or `sendToPlugin`), in order; optionally one plugin's */
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
   */
  runFlow(label: string, options?: RunFlowOptions): Promise<FlowRun>;
  /** The steps a flow (the root flow or a subflow, by label) has run so far in this app */
  flowTrace(label: string): FlowStepTrace[];
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
  const registered = getRegisteredSystems();
  // In registration order, as the app spawns them (a pack's settings system before the systems that use it)
  const named = options.systems === '*' ? undefined : new Set(options.systems.map((id) => resolveSystemId(id, registered)));
  const systems = named ? new Map([...registered].filter(([id]) => named.has(id))) : registered;

  const emitted: OutgoingSystemEvents[] = [];
  const taken = new Set<number>();
  const waiters = new Set<() => void>();
  /** The brain's trace reports (TNODE_SPAWNED, TNODE_UPDATED), from its start: a client needn't be connected to run flows */
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
    for (const wake of waiters) wake();
  };
  const stopRecording = testRootEvents.onOutgoing((event) => {
    emitted.push(event);
    for (const wake of waiters) wake();
  });

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

  /** Resolves with what `check` finds once an event makes it find something */
  const waitForEmitted = <T>(check: () => T | undefined, timeoutMs: number, describe: () => string) => new Promise<T>((resolve, reject) => {
    const attempt = () => {
      const found = check();
      if (found === undefined) return false;
      waiters.delete(attempt);
      clearTimeout(timer);
      resolve(found);
      return true;
    };
    const timer = setTimeout(() => {
      waiters.delete(attempt);
      reject(new Error(describe()));
    }, timeoutMs);
    if (!attempt()) waiters.add(attempt);
  });

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
    settle: () => settle(),
    async runFlow(label, { event, data, timeoutMs = 10_000 } = {}) {
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
        throw new Error(`Flow "${label}" isn't running: ${why}. ${runningLabels.length > 0 ? `Running: ${runningLabels.join(', ')}` : 'No flow is running'}`);
      }

      const eventType = event ?? 'flow.entry';
      const deadline = Date.now() + timeoutMs;
      // An event's tracks are the ones it triggers from here; entry tracks ran when the flow started
      const cursor = event === undefined ? 0 : reports.length;
      const since = () => reports.slice(cursor);
      const timedOut = () => `Flow "${label}" didn't finish "${eventType}" within ${timeoutMs}ms. Steps so far: ${since().filter(isSpawn).filter((e) => e.tNode.tNodeType !== 'event' && flowTNodeIds.includes(e.flowTNodeId)).map((e) => `${e.tNode.label} (${stepTrace(e, tNodeRows).status})`).join(', ') || 'none'}`;
      if (event !== undefined) {
        if (!connected) {
          connected = true;
          testRootEvents.emitConnected();
        }
        testRootEvents.emitIncoming({ type: 'TRIGGER_BRAIN_EVENT', eventType: event, payload: data, systemId: brainId });
        await settle(deadline, timedOut);
      }

      const triggered = () => since().filter((e): e is TNodeSpawned =>
        isSpawn(e) && flowTNodeIds.includes(e.flowTNodeId) && e.tNode.tNodeType === 'event' && e.tNode.eventType === eventType);
      if (triggered().length === 0) {
        throw new Error(`Flow "${label}" has no track for "${eventType}"`);
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
    },
    flowTrace(label) {
      return reports.filter(isSpawn)
        .filter((e) => e.tNode.tNodeType !== 'event' && flowLabels.get(e.tNode.id) === label)
        .map((e) => stepTrace(e, tNodeRows));
    },
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
