import { BaseEntity, EARS } from '@/shared/ears/types';
import { flowRows } from '@/systems/_backend/mock-data/flows';


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
  color?: string;
  /** When true, completing this node will trigger parent flow completion */
  final?: boolean;
}

/*─────────────────────────────────────────────────────────────────
 * 2 ▸ Per‑kind specializations
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
  params?: Record<string, any>;         // Direct parameters
  fieldMappings?: Array<{               // Or map from context
    target: string;
    source: string;
    default?: any;
  }>;
}

export interface DecisionNode extends NodeBase {
  nodeType: 'decision';
  conditions: Array<{ expr: string; label?: string }>;
  elseLabel?: string;
}

export interface FireNode extends NodeBase {
  nodeType: 'fire';
  eventType: string;                   // '#THREAD.CREATE'
  payload?: unknown;
  scope?: 'local' | 'global';         // default 'local'
}

export interface ListenNode extends NodeBase {
  nodeType: 'listen';
  mode: 'entry' | 'internal';
  eventType: string;
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

export interface KeepAliveNode extends NodeBase {
  nodeType: 'keep_alive';
}

export interface LLMNode extends NodeBase {
  nodeType: 'llm';
  
  // Prompt configuration
  prompt?: string;                    // Direct prompt string
  promptTemplateId?: string;          // Or use a registered template ID
  fieldMappings?: Array<{             
    target: string;                   // Target field name in template
    source: string;                   // Path to extract value (e.g., '$.event.data.message')
    default?: any;                    // Default if source is undefined
  }>;
  
  // LLM configuration
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
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
  | FlowNode
  | KeepAliveNode
  | LLMNode;

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

/*─────────────────────────────────────────────────────────────────
 * Node enrichment for frontend
 * These fields are resolved from relationships and added when
 * sending data to the frontend
 *─────────────────────────────────────────────────────────────────*/
type ActionNodeRelations = {
  actionId?: string;      // From INSTANCE_OF relation to Action
  actionName?: string;    // From linked Action entity
};

type LLMNodeRelations = {
  promptTemplateId?: string;    // From INSTANCE_OF relation to Prompt
  promptTemplateName?: string;  // From linked Prompt entity
};

// Generic enrichment type that adds relational data based on node type
export type WithRelations<T extends NodeEntity> = T & (
  T extends ActionNode ? ActionNodeRelations :
  T extends LLMNode ? LLMNodeRelations :
  {}
);

// Type alias for clarity when using enriched nodes
export type NodeEntityEnriched = WithRelations<NodeEntity>;

// Input type for create/update operations that may include relational data
export type NodeCreateInput = Partial<NodeEntity> & {
  actionId?: string;  // Will be converted to INSTANCE_OF relationship
  promptTemplateId?: string;  // Will be converted to relationship
};

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
    nodes: NodeEntityEnriched[];
    edges: EdgeEntity[];
  };
  flows: Partial<FlowEntity>[];
  rootFlow?: Partial<FlowEntity>;
  models: ModelConfig[];
  prompts: any[]; // Will be typed as PromptEntity[] in frontend
}

export interface ModelConfig {
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

// export type FlowsStartupData = {
//     flows: FlowEntity[];
//     steps: StepEntity[];
//     stepRelations: StepRelation[];
//     events: FlowEventEntity[];
// }

export interface FlowExtendedData {
  nodes: NodeEntityEnriched[];
  edges: EdgeEntity[];
}
