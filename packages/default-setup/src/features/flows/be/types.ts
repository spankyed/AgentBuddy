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

export type IncomingFlowsEvents =
  | { type: 'FLOW_SELECT'; flowId: string }
  | { type: 'CREATE_FLOW' }
  | { type: 'DELETE_FLOW'; flowId: string }
  | { type: 'UPDATE_FLOW_LABEL'; flowId: string; label: string }
  | { type: 'CREATE_NODE'; flowId: string; tempId: string; nodeData: any }
  | { type: 'UPDATE_NODE'; flowId: string; nodeId: string; nodeData: any }
  | { type: 'DELETE_NODE'; flowId: string; nodeId: string }
  | { type: 'CREATE_EDGE'; flowId: string; sourceId: string; targetId: string; sourceHandle?: string; targetHandle?: string }
  | { type: 'DELETE_EDGE'; flowId: string; edgeId: string }
  | { type: 'UPDATE_EDGE'; flowId: string; edgeId: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }
  | { type: 'IMPORT_DSL'; dsl: any }
  | { type: 'EXPORT_DSL'; directory: string; flowId?: string }
  | { type: 'REINDEX_HANDLES'; flowId: string; nodeId: string; prefix: string; index: number; direction: 1 | -1 }
  /** Makes a flow the root flow the brain runs (its root role), or, with null, leaves no flow the root */
  | { type: 'SET_ROOT_FLOW'; flowId: string | null }

export type OutgoingFlowsEvents =
  | { type: 'FLOWS_CONNECTED'; data: FlowsConnectedData }
  | { type: 'FLOW_SELECTED'; flowId: EARS.EntityId; data: { nodes: any[]; edges: any[] } }
  | { type: 'FLOW_CREATED'; flow: FlowEntity; flowId: EARS.EntityId; data: { nodes: any[]; edges: any[] } }
  | { type: 'FLOW_DELETED'; flowId: EARS.EntityId }
  | { type: 'NODE_CREATED'; tempId: string; nodeId: EARS.EntityId; node: any }
  | { type: 'NODE_UPDATED'; nodeId: EARS.EntityId; node: any }
  | { type: 'NODE_DELETED'; nodeId: string }
  | { type: 'EDGE_CREATED'; sourceId: EARS.EntityId; targetId: EARS.EntityId; relId: EARS.EntityId; sourceHandle?: string; targetHandle?: string }
  | { type: 'EDGE_CREATE_FAILED'; sourceId: string; targetId: string; error: string }
  | { type: 'EDGE_DELETED'; edgeId: string }
  | { type: 'EDGE_UPDATED'; edgeId: EARS.EntityId; source: EARS.EntityId; target: EARS.EntityId; sourceHandle?: string; targetHandle?: string }
  | { type: 'EDGE_UPDATE_FAILED'; edgeId: string; error: string }
  | { type: 'ACTION_CREATED'; action: ActionEntity; actionId: EARS.EntityId }
  | { type: 'ACTION_UPDATED'; action: ActionEntity; actionId: EARS.EntityId }
  | { type: 'ACTION_DELETED'; actionId: EARS.EntityId }
  | { type: 'DSL_IMPORTED'; flowIds: EARS.EntityId[]; errors?: string[] }
  | { type: 'DSL_IMPORT_FAILED'; errors: string[] }
  | { type: 'DSL_EXPORTED'; filePath: string; flowCount: number }
  | { type: 'DSL_EXPORT_FAILED'; errors: string[] }
