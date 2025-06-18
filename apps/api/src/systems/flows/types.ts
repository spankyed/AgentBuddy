import { BaseEntity, EARS } from '@/shared/ears/types';
import { flowRows } from './repository/mock-data';


export interface FlowEntity extends BaseEntity {
  entityType: EARS.Entity.Flow;
  shortCode: string;
  label: string;
  description?: string;
  flowType: 'workflow' | 'integration';
  createdAt: number;
}

/*─────────────────────────────────────────────────────────────────
 * 1 ▸ Common base shared by every node
 *─────────────────────────────────────────────────────────────────*/
interface NodeBase extends BaseEntity {
  entityType: EARS.Entity.Node;
  /** discriminator */
  nodeType: NodeKind;                 // defined below
  label: string;
  description?: string;
  x?: number;
  y?: number;
  color?: string;
}

/*─────────────────────────────────────────────────────────────────
 * 2 ▸ Per‑kind specialisations
 *─────────────────────────────────────────────────────────────────*/
export interface QueryNode extends NodeBase {
  nodeType: 'query';
  prompt: string;
  resultKey?: string;
}

export interface CreateNode extends NodeBase {
  nodeType: 'create';
  entityTypeTarget: EARS.Entity;      // what kind of entity to mint
  entityId?: string;                  // optional explicit id
  inferLabel?: boolean;               // default true
}

export interface UpdateNode extends NodeBase {
  nodeType: 'update';
  entityId: string;                   // must exist
  onMissing?: 'fail' | 'ignore' | 'create';
}

export interface ActionNode extends NodeBase {
  nodeType: 'action';
  actionName: string;
  params?: Record<string, any>;
}

export interface DecisionNode extends NodeBase {
  nodeType: 'decision';
  conditions: Array<{ expr: string; label?: string }>;
  elseLabel?: string;
}

export interface FireNode extends NodeBase {
  nodeType: 'fire';
  eventTag: string;                   // '#THREAD.CREATE'
  payload?: unknown;
  scope?: 'local' | 'global';         // default 'local'
}

export interface ListenNode extends NodeBase {
  nodeType: 'listen';
  mode: 'entry' | 'internal';
  eventTag: string;
  debounceMs?: number;                // entry only
  scope?: 'local' | 'global';         // internal only
}

export interface TransformNode extends NodeBase {
  nodeType: 'transform';
  script: string;                     // NL or code
  outputType?: 'json' | 'text' | 'custom';
}

export interface FlowNode extends NodeBase {
  nodeType: 'flow';
  flowRef: string;                    // id / slug of child flow
  propagateCtx?: boolean;             // default true
}

/*─────────────────────────────────────────────────────────────────
 * 3 ▸ Union & helpers
 *─────────────────────────────────────────────────────────────────*/
export type NodeEntity =
  | QueryNode
  | CreateNode
  | UpdateNode
  | ActionNode
  | DecisionNode
  | FireNode
  | ListenNode
  | TransformNode
  | FlowNode;

/** Literal union of all nodeType strings (keeps Base clean) */
export type NodeKind = NodeEntity['nodeType'];

/* Optional—handy type guard generator */
export const isNodeKind = <K extends NodeKind>(k: K) =>
  (n: NodeEntity): n is Extract<NodeEntity, { nodeType: K }> =>
    n.nodeType === k;

// --------------------------------------------------------------------------------
export type FlowTypeCodes = 'variable' | 'llm' | 'decision' | 'action' | 'subflow';
export type FlowTypeShortCode = `${FlowTypeCodes}-${number}`;
export type FlowStatus = 'draft' | 'queued' | 'active' | 'inactive';

export type EdgeEntity = {
  id: EARS.EntityId;
  kind: EARS.RelKind;
  source: EARS.EntityId;
  target: EARS.EntityId;
  info?: { [key: string]: any; } 
};
export interface FlowsStartupData {
  selectedFlowId: EARS.EntityId;
  graph: {
    nodes: Partial<NodeEntity>[];
    edges: EdgeEntity[];
  };
  flows: Partial<FlowEntity>[];
  rootFlow?: Partial<FlowEntity>;
}

// export type FlowsStartupData = {
//     flows: FlowEntity[];
//     steps: StepEntity[];
//     stepRelations: StepRelation[];
//     events: FlowEventEntity[];
// }

export interface FlowExtendedData {
  nodes: Partial<NodeEntity>[];
  edges: EdgeEntity[];
}
