import { BaseEntity, EARS } from '@/shared/ears/types';

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
}

export interface EventReceived {
  eventType: string;
  payload?: any;
}

// Brain Runner Types
export interface ExecutionContext {
  // Event track data
  eventType: string;          // The event that triggered this track
  eventPayload?: any;        // The payload of the triggering event
  
  // Results from previous steps in this track
  previousResults: Array<{
    stepId: string;
    stepLabel: string;
    result: any;
    timestamp: number;
  }>;
  
  // Allow additional properties
  [key: string]: any;
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

// Mapping Types
export interface FieldMapping {
  targetField: string;          // The field name in the target (e.g., "userMessage")
  sourcePath: string;           // JSONPath or simple path to source value (e.g., "$.eventPayload.message")
  defaultValue?: any;           // Value to use if source is undefined
  transform?: string;           // Optional transform function name
}
