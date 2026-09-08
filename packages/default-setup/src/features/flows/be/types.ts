import { type BaseEntity, EARS } from '@/__generated__/ears';
import type { ActionEntity, PromptEntity } from '@/__generated__/types';
import type { ModelCatalogEntry } from '@abuddy/sdk/inference';
import type { NodeEntity } from '@abuddy/sdk/types';

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
 * Node entity (auto-populated via module augmentation in each step's types.ts)
 *─────────────────────────────────────────────────────────────────*/

export type { NodeEntity } from '@abuddy/sdk/types';

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
