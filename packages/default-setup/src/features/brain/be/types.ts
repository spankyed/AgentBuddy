import type { EARS } from '@/registries/ears';

/** ── Re-export SDK runtime types ────────────────────────────────────────── */
export type {
  TimestampMs,
  EntityStatus,
  TNodeKind,
  TNodeEntity,
  TrackEntity,
  ExecutionEvent,
  StepRun,
  RuntimeServices,
  ExecutionContext,
} from '@abuddy/sdk/steps';

import type { TimestampMs, TrackEntity, TNodeEntity, ExecutionContext } from '@abuddy/sdk/steps';

export type JsonPath = string;

/** ── Brain-local types ──────────────────────────────────────────────────── */
export interface EventListenerEntity {
  id: EARS.EntityId;
  nodeId: EARS.EntityId;
  eventType: string;
  label: string;
  triggerType: string;
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

export type { StepRuntimeError } from '@abuddy/sdk/steps';

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

// Brain-private types
export interface EventReceived {
  eventType: string;
  payload?: unknown;
}
