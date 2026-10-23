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

/** A node as it is added: its root is the parent's, or its own id when it has no parent */
export type TNodeInput = Omit<TNode, 'rootId'>;

/** What an update may change: a node's identity and place in its tree are fixed when it is added */
export type TNodePatch = Partial<Pick<TNode, 'label' | 'status' | 'completedAt' | 'nodeAttributes' | 'result'>>;

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
  /** A new node id, sorting after every one handed out before */
  newId(): TNodeId;
  /** Records a node. One whose parent isn't in the history is dropped and logged: a tree has no orphans */
  add(node: TNodeInput): void;
  /** Changes a node; an id with no node is ignored */
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
    newId: () => records.newId('TNode') as TNodeId,
    add(node) {
      if (node.parentId === undefined) {
        records.put({ ...bounded(node), rootId: node.id });
        return;
      }
      const parent = records.get(node.parentId);
      if (!parent) {
        logger.warn(`Dropped run node ${node.id}: its parent ${node.parentId} isn't in the run history`);
        return;
      }
      records.put({ ...bounded(node), rootId: parent.rootId });
    },
    update(id, patch) {
      const node = records.get(id);
      if (node) records.put({ ...node, ...bounded(patch) });
    },
    get: (id) => records.get(id),
    findChildren: (id, page = {}) => records.findBy('parentId', id, page),
    tree(id) {
      const node = history.get(id);
      if (!node) return undefined;
      const grow = (parent: TNode): RunTree => ({ ...parent, children: history.findChildren(parent.id).map(grow) });
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
