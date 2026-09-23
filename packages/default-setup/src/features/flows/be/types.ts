import { type NodeEntity } from '@/__generated__/types';
import { EARS } from '@/__generated__/ears';
import type { ModelCatalogEntry } from '@abuddy/sdk/models';
import type { FlowEdge } from '@abuddy/sdk/repositories';

/*─────────────────────────────────────────────────────────────────
 * Flow & Edge entities
 *─────────────────────────────────────────────────────────────────*/

import type { FlowEntity, ActionEntity, PromptEntity } from '@abuddy/sdk';

/** A transition between two nodes, as the SDK's flow repository returns it */
export type EdgeEntity = FlowEdge;

/*─────────────────────────────────────────────────────────────────
 * Node entity: generated union of the step node interfaces in each step's types.ts
 *─────────────────────────────────────────────────────────────────*/

export type { NodeEntity } from '@/__generated__/types';

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

// ── This feature's settings ───────────────────────────────────────────────
// Its own shape, which the app stores without knowing: the app owns the document, each feature its slice.
export interface FlowsSettings {
  enableFlowPreview?: boolean; // Enable flow preview on single click
}
