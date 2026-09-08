import { type BaseEntity, EARS } from '@/__generated__/ears';
import type { ActionEntity, PromptEntity } from '@/__generated__/types';
import type { ModelCatalogEntry } from '@abuddy/sdk/inference';

export { BinaryOperator } from '@abuddy/sdk/utils';
export type { ModelCatalogEntry } from '@abuddy/sdk/inference';

/*─────────────────────────────────────────────────────────────────
 * Flow & Edge entities
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
 * Per-step entity types (re-exported from each step definition)
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
 * Node union & helpers
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

export interface FlowExtendedData {
  nodes: NodeEntity[];
  edges: EdgeEntity[];
}
