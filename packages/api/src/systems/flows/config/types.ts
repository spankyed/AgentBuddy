import { BaseEntity, EARS } from '@/core/types';
import type { ActionEntity } from '../../actions/types';
import type { PromptEntity } from '../../prompts/types';


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


/*─────────────────────────────────────────────────────────────────
 * Switch Node Types
 *─────────────────────────────────────────────────────────────────*/
export enum BinaryOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  GREATER_THAN_OR_EQUALS = 'greater_than_or_equals',
  LESS_THAN_OR_EQUALS = 'less_than_or_equals',
  CONTAINS = 'contains',
  STARTS_WITH = 'starts_with',
  ENDS_WITH = 'ends_with',
  MATCHES = 'matches',
  IS_EMPTY = 'is_empty',
  IS_NULL = 'is_null',
}

export type Predicate = {
  key: string;
  operator: BinaryOperator;
  value?: any;
} | ((context: any) => boolean);

export type Condition = {
  predicate?: Predicate;
  label?: string;
  mode?: 'expression' | 'code';
  code?: string;
};

export interface SwitchNode extends NodeBase {
  nodeType: 'switch';
  conditions: Array<Condition>;
  elseLabel?: string;
}

export interface FireNode extends NodeBase {
  nodeType: 'fire';
  eventType: string;                   // '#THREAD.CREATE'
  payload?: unknown;
  scope?: 'local' | 'global';         // default 'local'
}

export interface ListenerNode extends NodeBase {
  nodeType: 'listener';
  scope: 'global' | 'local' | 'entry'; // global=anywhere, local=current flow, entry=flow entry point
  eventType: string;
  debounceMs?: number;                // optional debounce for global and local scopes
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
  fieldMappings?: Array<{             // Map entry parameter
    target: string;
    source: string;
    default?: any;
  }>;
}

export interface KeepAliveNode extends NodeBase {
  nodeType: 'keep_alive';
}

export interface KillNode extends NodeBase {
  nodeType: 'kill';
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

export interface ActionNode extends NodeBase {
  nodeType: 'action';
  mode?: 'template' | 'code';            // default 'template' (select existing action)
  actionId?: string;                      // Reference to Action entity (template mode)
  actionFn?: string;                      // Inline code (code mode)
  params?: Record<string, any>;           // Direct parameters
  fieldMappings?: Array<{                 // Or map from context
    target: string;
    source: string;
    default?: any;
  }>;
}


/*─────────────────────────────────────────────────────────────────
 * 3 ▸ Union & helpers
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

/** Literal union of all nodeType strings (keeps Base clean) */
export type NodeKind = NodeEntity['nodeType'];

/* Optional—handy type guard generator */
export const isNodeKind = <K extends NodeKind>(k: K) =>
  (n: NodeEntity): n is Extract<NodeEntity, { nodeType: K }> =>
    n.nodeType === k;

// Type utility to ensure exhaustive node type handling
export function assertNever(x: never): never {
  throw new Error('Unexpected node type: ' + x);
}


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
  sourceHandle?: string;  // For switch nodes with multiple outputs
  targetHandle?: string;  // For nodes with multiple inputs
  info?: { [key: string]: any; }
};
export interface FlowsConnectedData {
  selectedFlowId: EARS.EntityId;
  graph: {
    nodes: NodeEntity[];
    edges: EdgeEntity[];
  };
  flows: Partial<FlowEntity>[];
  rootFlow?: Partial<FlowEntity>;
  models: ModelConfig[];
  prompts: PromptEntity[];
  actions: ActionEntity[];
  settings?: any; // FlowsSettings from backend
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


export interface FlowExtendedData {
  nodes: NodeEntity[];
  edges: EdgeEntity[];
}
