import type { BaseEntity, EARS } from '@/core/types';

/** ── Shared aliases ─────────────────────────────────────────────────────── */
export type TimestampMs = number;
export type EntityStatus = 'active' | 'paused' | 'completed' | 'failed';
export type TNodeKind = 'flow' | 'event' | 'step';
export type JsonPath = string;
// export type JsonPath = `$${string}`;

/** ── Core entities ──────────────────────────────────────────────────────── */
export interface TNodeEntity extends BaseEntity {
  entityType: EARS.Entity.TNode;
  tNodeType: TNodeKind;
  label: string;
  status: EntityStatus;
  startedAt: TimestampMs;
  completedAt?: TimestampMs;

  // For event nodes pulsing
  eventType?: string;
  triggerType?: 'listener' | 'schedule';
  cronExpression?: string;

  // Type of the node being executed
  stepNodeType?: string;

  // Triggers flow completion when this step completes
  final?: boolean;

  // Instantiated blueprint node attributes (resolved runtime data)
  nodeAttributes?: Record<string, unknown>;

  // User-provided params only (direct + mapped) — used by handlers for execution
  resolvedParams?: Record<string, unknown>;

  // Reference to the blueprint node and its containing flow
  blueprint?: {
    nodeId: EARS.EntityId;
    flowId: EARS.EntityId;
  };
}

export interface TrackEntity extends TNodeEntity {
  children: TrackEntity[];
}

export interface EventListenerEntity {
  id: EARS.EntityId;
  nodeId: EARS.EntityId;
  eventType: string;
  label: string;
  triggerType: 'listener' | 'schedule';
  scope?: 'global' | 'local' | 'entry';
  cronExpression?: string;
}

export interface FlowTNodeData {
  flowTNodeId: EARS.EntityId;
  tNodeTree: TrackEntity[];
  possibleEvents: EventListenerEntity[];
  flowHierarchy: Array<{ flowTNodeId: EARS.EntityId; label: string }>;
}

export interface TNodeUpdate {
  tNodeId: EARS.EntityId;
  status: TNodeEntity['status'];
  eventTNodeId?: EARS.EntityId;
}

/** ── Brain runner types ─────────────────────────────────────────────────── */
export interface ExecutionEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp?: TimestampMs;
  source?: string;
}

export interface StepRun {
  id?: string;               // Trace TNode ID (for linking to execution trace)
  label: string;
  result: unknown;
  timestamp: TimestampMs;
}

export interface ExecutionContext {
  flowTNodeId: EARS.EntityId;     // Flow instance ID (for routing & action functions)
  event: ExecutionEvent;
  steps: StepRun[];
  lastStep?: Omit<StepRun, 'timestamp'>;
}

/** ── Schema definition types ────────────────────────────────────────────── */
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

/** ── Typed context paths (constants unchanged) ──────────────────────────── */
export const ContextPaths = {
  // Event paths
  EVENT_TYPE: '$.event.type' as const,
  EVENT_DATA: '$.event.data' as const,
  EVENT_TIMESTAMP: '$.event.timestamp' as const,

  // Common event data patterns
  EVENT_MESSAGE: '$.event.data.message' as const,
  EVENT_PAYLOAD: '$.event.data.payload' as const,
  EVENT_TEXT: '$.event.data.text' as const,
  EVENT_USER_ID: '$.event.data.userId' as const,

  // Step paths
  LAST_STEP: '$.lastStep' as const,
  LAST_STEP_RESULT: '$.lastStep.result' as const,
  STEPS: '$.steps' as const,

  // Helper functions (return the same string shapes as before)
  stepById: (tNodeId: string): JsonPath => `$.steps[id=${tNodeId}].result`,
  stepByLabel: (label: string): JsonPath => `$.steps[label=${label}].result`,
} as const;

/** ── Field mapping ─────────────────────────────────────────────────────── */
export type SourceResolver = JsonPath | ((ctx: ExecutionContext) => unknown);

export interface FieldMapping {
  target: string;           // Target field in template
  source: SourceResolver;   // JsonPath or resolver function
  default?: unknown;        // Fallback if source is undefined
}
