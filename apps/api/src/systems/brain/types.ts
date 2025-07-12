import { BaseEntity, EARS } from '@/core/utils/ears/types';

export interface TNodeEntity extends BaseEntity {
  entityType: EARS.Entity.TNode;
  tNodeType: 'flow' | 'event' | 'step';
  label: string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  startedAt: number;
  
  // For event nodes pulsing
  eventType?: string;
  
  // For step nodes
  stepNodeId?: EARS.EntityId; // Reference to the Flow Node being executed
  stepNodeType?: string; // Type of the node being executed

  // Copied from blueprint node - triggers flow completion when this step completes
  final?: boolean;

  // Node-specific attributes from the original NodeEntity with resolved values
  // This is a complete instantiation of the blueprint node with actual runtime data
  // For LLM nodes: model, temperature, maxTokens, systemPrompt, prompt, promptTemplateId, + resolved template params
  // For Action nodes: actionId, + resolved action params (direct params merged with mapped params)
  // For Listen nodes: mode, debounceMs, scope
  // For Fire nodes: eventType, payload, scope
  // etc.
  nodeAttributes?: Record<string, any>;
}

export interface TrackEntity extends TNodeEntity {
  children: TrackEntity[];
}

export interface EventListenerEntity {
  id: EARS.EntityId;
  nodeId: EARS.EntityId;
  eventType: string;
  label: string;
  mode: 'entry' | 'internal';
}

export interface FlowTNodeData {
  flowTNodeId: EARS.EntityId;
  tNodeTree: TrackEntity[];
  possibleEvents: EventListenerEntity[];
}

export interface TNodeUpdate {
  tNodeId: EARS.EntityId;
  status: TNodeEntity['status'];
  stepNodeId?: EARS.EntityId;
  eventTNodeId?: EARS.EntityId;
}

export interface EventReceived {
  eventType: string;
  payload?: any;
}

// Brain Runner Types
export interface ExecutionContext {
  // Event that triggered this execution
  event: {
    type: string;           // The event type (e.g., 'user.message')
    data: Record<string, any>;  // Event data (what was previously eventPayload)
    timestamp?: number;     // When the event occurred
    source?: string;        // Where the event came from
  };
  
  // Results from previous steps in this track
  steps: Array<{
    id: string;             // Step ID for reliable references
    label: string;          // Human-readable label
    result: any;            // The step's output
    timestamp: number;      // When it completed
  }>;
  
  // Computed properties for convenience
  lastStep?: {
    id: string;
    label: string;
    result: any;
  };
}

// Schema Definition Types
export interface FieldSchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
  description?: string;
  required?: boolean;
  // For objects and arrays
  properties?: Record<string, FieldSchema>;
  items?: FieldSchema;
}

export interface EventSchema {
  eventType: string;
  description?: string;
  fields: Record<string, FieldSchema>;
}

export interface StepOutputSchema {
  stepId: string;
  stepLabel: string;
  description?: string;
  fields: Record<string, FieldSchema>;
}

// Type-safe path constants to replace string-based paths
export const ContextPaths = {
  // Event paths
  EVENT_TYPE: '$.event.type',
  EVENT_DATA: '$.event.data',
  EVENT_TIMESTAMP: '$.event.timestamp',
  
  // Common event data patterns
  EVENT_MESSAGE: '$.event.data.message',
  EVENT_PAYLOAD: '$.event.data.payload',
  EVENT_TEXT: '$.event.data.text',
  EVENT_USER_ID: '$.event.data.userId',
  
  // Step paths
  LAST_STEP: '$.lastStep',
  LAST_STEP_RESULT: '$.lastStep.result',
  STEPS: '$.steps',
  
  // Helper function to get step by ID
  stepById: (stepId: string) => `$.steps[id=${stepId}].result`,
  stepByLabel: (label: string) => `$.steps[label=${label}].result`,
} as const;

// Simplified field mapping that's easier to understand
export interface FieldMapping {
  target: string;               // Target field name in template
  source: string | ((ctx: ExecutionContext) => any);  // Path or function
  default?: any;                // Default value if source is undefined
}
