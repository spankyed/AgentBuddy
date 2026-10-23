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

/** @internal The records a run history keeps: a record store's operations (`openRecordStore`, `@apackdev/ears/lmdb`) */
export interface _RunHistoryRecords {
  get(id: string): object | undefined;
  put(record: { id: string }): void;
  delete(id: string): void;
  findBy(index: string, value: string | number | boolean, options?: { reverse?: boolean; limit?: number; cursor?: string }): object[];
  newId(prefix: string): string;
}

/** @internal The fields a run history's records are indexed by, which its record store must declare */
export const _RUN_HISTORY_INDEXES = ['parentId', 'rootId', 'status', 'tNodeType', 'runOf', 'isRoot'] as const;

/** The fields a record carries only to be found by: a flow node's flow, and whether it is a session's root */
type Indexed = { runOf?: EARS.EntityId; isRoot?: true };

const logger = createLogger('run-history');

/** A node as the store holds it: values JSON can hold, and the fields it is found by */
function stored(node: TNode): TNode & Indexed {
  return {
    ...node,
    ...(node.nodeAttributes !== undefined && { nodeAttributes: truncateResult(node.nodeAttributes) as Record<string, unknown> }),
    ...(node.resolvedParams !== undefined && { resolvedParams: truncateResult(node.resolvedParams) as Record<string, unknown> }),
    ...(node.result !== undefined && { result: truncateResult(node.result) }),
    ...(node.tNodeType === 'flow' && node.flowId !== undefined && { runOf: node.flowId }),
    ...(node.parentId === undefined && { isRoot: true }),
  };
}

function read(record: object | undefined): TNode | undefined {
  if (!record) return undefined;
  const { runOf: _runOf, isRoot: _isRoot, ...node } = record as TNode & Indexed;
  return node;
}

/** @internal The run history over its records: the host's are a record store on disk, a test's in memory */
export function _createRunHistory(records: _RunHistoryRecords): RunHistory {
  const nodes = (found: object[]) => found.map((record) => read(record)!);
  const history: RunHistory = {
    newId: () => records.newId('TNode') as TNodeId,
    add(node) {
      if (node.parentId === undefined) {
        records.put(stored({ ...node, rootId: node.id }));
        return;
      }
      const parent = read(records.get(node.parentId));
      if (!parent) {
        logger.warn(`Dropped run node ${node.id}: its parent ${node.parentId} isn't in the run history`);
        return;
      }
      records.put(stored({ ...node, rootId: parent.rootId }));
    },
    update(id, patch) {
      const node = read(records.get(id));
      if (node) records.put(stored({ ...node, ...patch }));
    },
    get: (id) => read(records.get(id)),
    findChildren: (id, page = {}) => nodes(records.findBy('parentId', id, page)),
    tree(id) {
      const node = history.get(id);
      if (!node) return undefined;
      const grow = (parent: TNode): RunTree => ({ ...parent, children: history.findChildren(parent.id).map(grow) });
      return grow(node);
    },
    findRuns: ({ flowId, limit, cursor } = {}) => nodes(flowId === undefined
      ? records.findBy('tNodeType', 'flow', { reverse: true, limit, cursor })
      : records.findBy('runOf', flowId, { reverse: true, limit, cursor })),
    stopActive() {
      const now = Date.now();
      for (const node of nodes(records.findBy('status', 'active'))) records.put(stored({ ...node, status: 'stopped', completedAt: now }));
    },
    prune({ before }) {
      let removed = 0;
      for (const root of nodes(records.findBy('isRoot', true))) {
        if (root.status === 'active' || (root.completedAt ?? root.startedAt) >= before) continue;
        for (const node of nodes(records.findBy('rootId', root.id))) records.delete(node.id);
        removed++;
      }
      return removed;
    },
  };
  return history;
}
