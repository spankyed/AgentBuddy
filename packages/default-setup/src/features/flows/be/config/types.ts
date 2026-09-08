import { type BaseEntity, EARS } from '@/__generated__/ears';
import type { ActionEntity, PromptEntity } from '@/__generated__/types';

// Re-export BinaryOperator so consumers importing from flows types get it
export { BinaryOperator } from '@abuddy/sdk/utils';

/*─────────────────────────────────────────────────────────────────
 * Flow & Edge entities (infrastructure types)
 *─────────────────────────────────────────────────────────────────*/

export interface FlowEntity extends BaseEntity {
  entityType: EARS.Entity.Flow;
  shortCode: string;
  label: string;
  description?: string;
  flowType: 'workflow' | 'integration';
  createdAt: number;
  sourceHash?: string;
}

export interface NodeBase extends BaseEntity {
  entityType: EARS.Entity.Node;
  nodeType: string;
  label: string;
  description?: string;
  color?: string;
  final?: boolean;
}

export type EdgeEntity = {
  id: EARS.EntityId;
  kind: EARS.RelKind;
  source: EARS.EntityId;
  target: EARS.EntityId;
  sourceHandle?: string;
  targetHandle?: string;
  info?: { [key: string]: any; }
};

/*─────────────────────────────────────────────────────────────────
 * Per-step entity types (owned by each step definition)
 *─────────────────────────────────────────────────────────────────*/

export type { ActionNode } from '@/extensions/steps/action/types';
export type { LLMNode } from '@/extensions/steps/llm/types';
export type { SwitchNode, Condition, Predicate } from '@/extensions/steps/switch/types';
export type { FireNode } from '@/extensions/steps/fire/types';
export type { ListenerNode } from '@/extensions/steps/listener/types';
export type { TransformNode } from '@/extensions/steps/transform/types';
export type { FlowNode } from '@/extensions/steps/flow/types';
export type { QueryNode } from '@/extensions/steps/query/types';
export type { CreateNode } from '@/extensions/steps/create/types';
export type { UpdateNode } from '@/extensions/steps/update/types';
export type { KeepAliveNode } from '@/extensions/steps/keep-alive/types';
export type { KillNode } from '@/extensions/steps/kill/types';

import type { ActionNode } from '@/extensions/steps/action/types';
import type { LLMNode } from '@/extensions/steps/llm/types';
import type { SwitchNode } from '@/extensions/steps/switch/types';
import type { FireNode } from '@/extensions/steps/fire/types';
import type { ListenerNode } from '@/extensions/steps/listener/types';
import type { TransformNode } from '@/extensions/steps/transform/types';
import type { FlowNode } from '@/extensions/steps/flow/types';
import type { QueryNode } from '@/extensions/steps/query/types';
import type { CreateNode } from '@/extensions/steps/create/types';
import type { UpdateNode } from '@/extensions/steps/update/types';
import type { KeepAliveNode } from '@/extensions/steps/keep-alive/types';
import type { KillNode } from '@/extensions/steps/kill/types';

/*─────────────────────────────────────────────────────────────────
 * Union & helpers
 *─────────────────────────────────────────────────────────────────*/

export type NodeEntity =
  | QueryNode
  | CreateNode
  | UpdateNode
  | ActionNode
  | SwitchNode
  | FireNode
  | ListenerNode
  | TransformNode
  | FlowNode
  | KeepAliveNode
  | KillNode
  | LLMNode;

export type NodeKind = NodeEntity['nodeType'] | (string & {});

export const isNodeKind = <K extends NodeKind>(k: K) =>
  (n: NodeEntity): n is Extract<NodeEntity, { nodeType: K }> =>
    n.nodeType === k;

export function assertNever(x: never): never {
  throw new Error('Unexpected node type: ' + x);
}

export type NodeCreateInput = Partial<NodeEntity> & {
  actionId?: string;
  promptTemplateId?: string;
};

/*─────────────────────────────────────────────────────────────────
 * Connected data / UI types
 *─────────────────────────────────────────────────────────────────*/

export interface FlowsConnectedData {
  selectedFlowId: EARS.EntityId;
  graph: {
    nodes: NodeEntity[];
    edges: EdgeEntity[];
  };
  flows: Partial<FlowEntity>[];
  rootFlow?: Partial<FlowEntity>;
  models: ModelCatalogEntry[];
  prompts: PromptEntity[];
  actions: ActionEntity[];
  settings?: any;
}

export interface ModelCatalogEntry {
  id: string;
  name: string;
  provider: string;
  description?: string;
  contextWindow: number;
  maxOutput?: number;
  costPer1kInput?: number;
  costPer1kOutput?: number;
  capabilities?: string[];
}

export interface FlowExtendedData {
  nodes: NodeEntity[];
  edges: EdgeEntity[];
}
