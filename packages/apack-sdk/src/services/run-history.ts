import type { RecordIndexes, RecordStore } from '@apackdev/ears';
import type { EARS } from '../types/entities.ts';
import { truncateResult } from '../steps/result-truncator.ts';
import { createLogger } from '../logger/logger.ts';

/** A run-history node's id: time-sortable, so a node's children and a flow's runs come back in the order they began */
export type RunNodeId = `RunNode-${string}`;

/** Where a run node is: running, finished, failed, or stopped by a kill, a restart or the app closing first */
export type RunStatus = 'active' | 'completed' | 'failed' | 'stopped';

/** What every run node has, whatever it ran */
export interface RunNodeBase {
  id: RunNodeId;
  label: string;
  status: RunStatus;
  startedAt: number;
  completedAt?: number;
  /** The node this one ran under: absent on a session's root */
  parentId?: RunNodeId;
  /** The session's root, which the whole tree is pruned with */
  rootId: RunNodeId;
  /** The flow whose nodes this run walks */
  flowId?: EARS.EntityId;
  /** The step, trigger or subflow node this one ran */
  nodeId?: EARS.EntityId;
  final?: boolean;
}

/** A flow run: a session's root, or a subflow a step started */
export interface FlowRunNode extends RunNodeBase {
  kind: 'flow';
  /** `subflow` for a flow a step started */
  stepNodeType?: string;
  /** What the subflow step was given (its settings, with its mappings applied), as recorded: bounded */
  input?: Record<string, unknown>;
  /** What the flow ended with */
  result?: unknown;
  eventType?: never; triggerType?: never; cronExpression?: never; payload?: never;
}

/** An event a flow run heard, which a track ran under */
export interface EventRunNode extends RunNodeBase {
  kind: 'event';
  eventType: string;
  /** The trigger that heard it: `listener`, `schedule`, ... */
  triggerType: string;
  cronExpression?: string;
  /** What the event carried, as recorded: bounded */
  payload?: unknown;
  stepNodeType?: never; input?: never; result?: never;
}

/** A step a track ran */
export interface StepRunNode extends RunNodeBase {
  kind: 'step';
  stepNodeType: string;
  /** What the step was given (its settings, with its mappings applied), as recorded: bounded */
  input?: Record<string, unknown>;
  /** What the step returned, or `{ error }` when it failed */
  result?: unknown;
  eventType?: never; triggerType?: never; cronExpression?: never; payload?: never;
}

/**
 * One node of a flow run's record: a flow, an event it heard, or a step it ran, told apart by `kind`. A run is a
 * tree of them under the session's root, linked by `parentId`. It is a record in the run history
 * (`services.runHistory`), not an entity — the engine never holds one — and what it records is bounded for display:
 * nothing runs on it.
 */
export type RunNode = FlowRunNode | EventRunNode | StepRunNode;

/** A node as it starts: the run history gives it its id, its root, `active` and its start time */
export type RunNodeStart =
  | Omit<FlowRunNode, 'id' | 'rootId' | 'status' | 'startedAt' | 'completedAt'>
  | Omit<EventRunNode, 'id' | 'rootId' | 'status' | 'startedAt' | 'completedAt'>
  | Omit<StepRunNode, 'id' | 'rootId' | 'status' | 'startedAt' | 'completedAt'>;

/** What a running node's record may take: its details. Its identity and place are fixed when it starts, and `finish` ends it */
export interface RunNodePatch {
  label?: string;
  input?: Record<string, unknown>;
  payload?: unknown;
  result?: unknown;
}

/** A node with its children, each with theirs: one node's whole subtree */
export type RunTree = RunNode & { children: RunTree[] };

/** How a list of nodes is paged: oldest first unless `reverse`, resuming after `cursor` */
export interface RunPage {
  limit?: number;
  cursor?: RunNodeId;
  reverse?: boolean;
}

/**
 * The run history: every flow run's tree of nodes, appended while it runs and kept after it ends. It is outside
 * the engine on purpose — a run is a log, never part of a unit of the user's data — so a write here is never undone
 * by a `transact` that throws, and none waits on one.
 */
export interface RunHistory {
  /**
   * Records a node starting now, under a new id that sorts after every one before, and returns it as given — not as
   * stored, since the history bounds what it stores and a step runs on its params whole. One whose parent isn't in
   * the history is returned but not recorded, and logged: a tree has no orphans.
   */
  start(node: RunNodeStart): RunNode;
  /** Ends a node now, completed or failed; an id with no node is ignored */
  finish(id: RunNodeId, status: 'completed' | 'failed'): void;
  /** Records a node's details: its label, attributes or result; an id with no node is ignored */
  update(id: RunNodeId, patch: RunNodePatch): void;
  get(id: RunNodeId): RunNode | undefined;
  /** A node's children, in the order they began */
  findChildren(id: RunNodeId, page?: RunPage): RunNode[];
  /** A node and every node under it, or undefined */
  tree(id: RunNodeId): RunTree | undefined;
  /** Flow nodes at any depth, newest first, of one flow when `flowId` is given */
  findRuns(options?: { flowId?: EARS.EntityId; limit?: number; cursor?: RunNodeId }): RunNode[];
  /** Marks every node still `active` as `stopped`: what is left of runs a kill, a restart or the app closing ended */
  stopActive(): void;
  /** Removes whole runs: every session tree whose root is not active and ended before `before`. Returns how many */
  prune(options: { before: number }): number;
}

/**
 * @internal What a run history's record store files its nodes under, which the store is opened with: their place in
 * a tree, their status and kind, and two computed — a flow node's flow (`runOf`) and whether it is a session's root
 */
export const _RUN_HISTORY_INDEXES: RecordIndexes<RunNode> = {
  parentId: (node) => node.parentId,
  rootId: (node) => node.rootId,
  status: (node) => node.status,
  kind: (node) => node.kind,
  runOf: (node) => (node.kind === 'flow' ? node.flowId : undefined),
  isRoot: (node) => node.parentId === undefined || undefined,
};

const logger = createLogger('run-history');

/**
 * The values being written, made storable and bounded. Only those: a value stored earlier was bounded when it was
 * written, and bounding it again would wrap its marker in another
 */
function bounded<T extends RunNodePatch>(fields: T): T {
  return {
    ...fields,
    ...(fields.input !== undefined && { input: truncateResult(fields.input) as Record<string, unknown> }),
    ...(fields.payload !== undefined && { payload: truncateResult(fields.payload) }),
    ...(fields.result !== undefined && { result: truncateResult(fields.result) }),
  };
}

/** @internal The run history over its record store: the host's on disk, a test's in memory (`createMemoryRecordStore`) */
export function _createRunHistory(records: RecordStore<RunNode>): RunHistory {
  const history: RunHistory = {
    start(fields) {
      const id = records.newId('RunNode') as RunNodeId;
      const parent = fields.parentId === undefined ? undefined : records.get(fields.parentId);
      const node = { ...fields, id, rootId: parent?.rootId ?? id, status: 'active', startedAt: Date.now() } as RunNode;
      if (fields.parentId !== undefined && !parent) {
        logger.warn(`Dropped run node ${id}: its parent ${fields.parentId} isn't in the run history`);
      } else {
        records.put(bounded(node));
      }
      return node;
    },
    finish(id, status) {
      const node = records.get(id);
      if (node) records.put({ ...node, status, completedAt: Date.now() });
    },
    update(id, patch) {
      const node = records.get(id);
      if (node) records.put({ ...node, ...bounded(patch) } as RunNode);
    },
    get: (id) => records.get(id),
    findChildren: (id, page = {}) => records.findBy('parentId', id, page),
    tree(id) {
      const node = records.get(id);
      if (!node) return undefined;
      // One read: the whole run, in the order its nodes began, then grown from `id`
      const childrenOf = new Map<string, RunNode[]>();
      for (const each of records.findBy('rootId', node.rootId)) {
        if (each.parentId === undefined) continue;
        const siblings = childrenOf.get(each.parentId);
        if (siblings) siblings.push(each);
        else childrenOf.set(each.parentId, [each]);
      }
      const grow = (parent: RunNode): RunTree => ({ ...parent, children: (childrenOf.get(parent.id) ?? []).map(grow) });
      return grow(node);
    },
    findRuns: ({ flowId, limit, cursor } = {}) => (flowId === undefined
      ? records.findBy('kind', 'flow', { reverse: true, limit, cursor })
      : records.findBy('runOf', flowId, { reverse: true, limit, cursor })),
    stopActive() {
      const now = Date.now();
      for (const node of records.findBy('status', 'active')) records.put({ ...node, status: 'stopped', completedAt: now });
    },
    prune({ before }) {
      let removed = 0;
      for (const root of records.findBy('isRoot', true)) {
        if (root.status === 'active' || (root.completedAt ?? root.startedAt) >= before) continue;
        for (const node of records.findBy('rootId', root.id)) records.delete(node.id);
        removed++;
      }
      return removed;
    },
  };
  return history;
}
