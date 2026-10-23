import type { RecordIndexes, RecordStore } from '@apackdev/ears';
import type { EARS } from '../types/entities.ts';
import type { TNodeKind } from '../steps/types.ts';
import { truncateResult } from '../steps/result-truncator.ts';
import { createLogger } from '../logger/logger.ts';

/** A run-history node's id: time-sortable, so a node's children and a flow's runs come back in the order they began */
export type TNodeId = `TNode-${string}`;

/** Where a run node is: running, finished, failed, or stopped by a kill, a restart or the app closing first */
export type RunStatus = 'active' | 'completed' | 'failed' | 'stopped';

/**
 * One node of a flow run's record: a flow, an event it heard, or a step it ran. A run is a tree of them under the
 * session's root, linked by `parentId`. It is a record in the run history (`services.runHistory`), not an entity:
 * the engine never holds one.
 */
export interface TNode {
  id: TNodeId;
  tNodeType: TNodeKind;
  label: string;
  status: RunStatus;
  startedAt: number;
  completedAt?: number;
  /** The node this one ran under: absent on a session's root */
  parentId?: TNodeId;
  /** The session's root, which the whole tree is pruned with */
  rootId: TNodeId;
  /** The flow whose nodes this run walks */
  flowId?: EARS.EntityId;
  /** The step, trigger or subflow node this one ran */
  nodeId?: EARS.EntityId;
  eventType?: string;
  triggerType?: string;
  cronExpression?: string;
  stepNodeType?: string;
  final?: boolean;
  nodeAttributes?: Record<string, unknown>;
  resolvedParams?: Record<string, unknown>;
  /** What the step returned, or `{ error }` when it failed */
  result?: unknown;
}

/** A node as it starts: the run history gives it its id, its root, `active` and its start time */
export type TNodeStart = Omit<TNode, 'id' | 'rootId' | 'status' | 'startedAt' | 'completedAt'>;

/** What a running node's record may take: its details. Its identity and place are fixed when it starts, and `finish` ends it */
export type TNodePatch = Partial<Pick<TNode, 'label' | 'nodeAttributes' | 'result'>>;

/** A node with its children, each with theirs: one node's whole subtree */
export interface RunTree extends TNode {
  children: RunTree[];
}

/** How a list of nodes is paged: oldest first unless `reverse`, resuming after `cursor` */
export interface RunPage {
  limit?: number;
  cursor?: TNodeId;
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
  start(node: TNodeStart): TNode;
  /** Ends a node now, completed or failed; an id with no node is ignored */
  finish(id: TNodeId, status: 'completed' | 'failed'): void;
  /** Records a node's details: its label, attributes or result; an id with no node is ignored */
  update(id: TNodeId, patch: TNodePatch): void;
  get(id: TNodeId): TNode | undefined;
  /** A node's children, in the order they began */
  findChildren(id: TNodeId, page?: RunPage): TNode[];
  /** A node and every node under it, or undefined */
  tree(id: TNodeId): RunTree | undefined;
  /** Flow nodes at any depth, newest first, of one flow when `flowId` is given */
  findRuns(options?: { flowId?: EARS.EntityId; limit?: number; cursor?: TNodeId }): TNode[];
  /** Marks every node still `active` as `stopped`: what is left of runs a kill, a restart or the app closing ended */
  stopActive(): void;
  /** Removes whole runs: every session tree whose root is not active and ended before `before`. Returns how many */
  prune(options: { before: number }): number;
}

/**
 * @internal What a run history's record store files its nodes under, which the store is opened with: their place in
 * a tree, their status and kind, and two computed — a flow node's flow (`runOf`) and whether it is a session's root
 */
export const _RUN_HISTORY_INDEXES: RecordIndexes<TNode> = {
  parentId: (node) => node.parentId,
  rootId: (node) => node.rootId,
  status: (node) => node.status,
  tNodeType: (node) => node.tNodeType,
  runOf: (node) => (node.tNodeType === 'flow' ? node.flowId : undefined),
  isRoot: (node) => node.parentId === undefined || undefined,
};

const logger = createLogger('run-history');

/**
 * The values being written, made storable and bounded. Only those: a value stored earlier was bounded when it was
 * written, and bounding it again would wrap its marker in another
 */
function bounded<T extends Partial<TNode>>(fields: T): T {
  return {
    ...fields,
    ...(fields.nodeAttributes !== undefined && { nodeAttributes: truncateResult(fields.nodeAttributes) as Record<string, unknown> }),
    ...(fields.resolvedParams !== undefined && { resolvedParams: truncateResult(fields.resolvedParams) as Record<string, unknown> }),
    ...(fields.result !== undefined && { result: truncateResult(fields.result) }),
  };
}

/** @internal The run history over its record store: the host's on disk, a test's in memory (`createMemoryRecordStore`) */
export function _createRunHistory(records: RecordStore<TNode>): RunHistory {
  const history: RunHistory = {
    start(fields) {
      const id = records.newId('TNode') as TNodeId;
      const parent = fields.parentId === undefined ? undefined : records.get(fields.parentId);
      const node: TNode = { ...fields, id, rootId: parent?.rootId ?? id, status: 'active', startedAt: Date.now() };
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
      if (node) records.put({ ...node, ...bounded(patch) });
    },
    get: (id) => records.get(id),
    findChildren: (id, page = {}) => records.findBy('parentId', id, page),
    tree(id) {
      const node = records.get(id);
      if (!node) return undefined;
      // One read: the whole run, in the order its nodes began, then grown from `id`
      const childrenOf = new Map<string, TNode[]>();
      for (const each of records.findBy('rootId', node.rootId)) {
        if (each.parentId === undefined) continue;
        const siblings = childrenOf.get(each.parentId);
        if (siblings) siblings.push(each);
        else childrenOf.set(each.parentId, [each]);
      }
      const grow = (parent: TNode): RunTree => ({ ...parent, children: (childrenOf.get(parent.id) ?? []).map(grow) });
      return grow(node);
    },
    findRuns: ({ flowId, limit, cursor } = {}) => (flowId === undefined
      ? records.findBy('tNodeType', 'flow', { reverse: true, limit, cursor })
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
