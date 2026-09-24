import type { StepRuntimeError } from '@abuddy/sdk/steps';
import type { EARS } from '@/__generated__/ears';

import type { TimestampMs, TrackTree, TNodeEntity, ExecutionContext } from '@abuddy/sdk/steps';

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
  tNodeTree: TrackTree[];
  possibleEvents: EventListenerEntity[];
  flowHierarchy: Array<{ flowTNodeId: EARS.EntityId; label: string }>;
}

export interface TNodeUpdate {
  tNodeId: EARS.EntityId;
  status: TNodeEntity['status'];
  eventTNodeId?: EARS.EntityId;
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

  // Helper functions, returning the same string shapes as the constants above
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

// ── This feature's settings ───────────────────────────────────────────────
// Its own shape, which the app stores without knowing: the app owns the document, each feature its slice.
export interface BrainSettings {
  inspectEnabled?: boolean; // Whether the brain inspection panel is enabled
}

export type IncomingBrainEvents =
  | { type: 'OPEN_TNODE'; tNodeId: string }
  | { type: 'GO_BACK_TNODE'; currentFlowTNodeId?: string }
  | { type: 'REQUEST_PLUGIN_DATA'; flowTNodeId?: string }
  | { type: 'GET_TNODE_DETAILS'; tNodeId: string }
  | { type: 'TOGGLE_INSPECT' }
  | { type: 'START_BRAIN' }
  | { type: 'KILL_BRAIN' }
  | { type: 'RESTART_BRAIN' }
  | { type: 'PAUSE_BRAIN' }
  | { type: 'RESUME_BRAIN' }
  | { type: 'HANDLE_BRAIN_EVENT'; eventType: string; payload?: any; targetFlowId?: string }
  | { type: 'TRIGGER_BRAIN_EVENT'; eventType: string; payload?: any; targetFlowId?: string }

// What the brain's own children send it: the flow and step machines it spawns, reporting what they did. Nothing
// outside the feature sends these, so they reach the machine's event union and no dependent pack's facade.
// `HANDLE_BRAIN_EVENT` is not one of them despite being raised here too — the database system sends it
// (`features/database/be/system.ts`), which makes it incoming.
export type BrainInternalEvents =
  | { type: 'TNODE_SPAWNED'; tNode: TNodeEntity; parentId?: EARS.EntityId; eventTNodeId?: EARS.EntityId; flowTNodeId: EARS.EntityId }
  | { type: 'TNODE_UPDATED'; data: TNodeUpdate }
  | { type: 'CHILD_COMPLETED'; stepId?: EARS.EntityId; tNodeId?: EARS.EntityId; stepLabel?: string; result?: any; final?: boolean; eventTNodeId?: EARS.EntityId; isFlow?: boolean }

export type OutgoingBrainEvents =
  | { type: 'RECEIVE_PLUGIN_DATA'; data: FlowTNodeData }
  // | { type: 'BRAIN_CONNECTED'; data: FlowTNodeData }
  | { type: 'TNODE_OPENED'; tNodeId: EARS.EntityId; data: FlowTNodeData }
  | { type: 'TNODE_SPAWNED'; tNode: TNodeEntity; parentId?: EARS.EntityId; eventTNodeId?: EARS.EntityId; flowTNodeId: EARS.EntityId }
  | { type: 'TNODE_UPDATED'; data: TNodeUpdate }
  | { type: 'EVENT_PULSE'; eventType: string }
  | { type: 'TNODE_DETAILS'; tNodeId: EARS.EntityId; details: TNodeEntity | null }
  | { type: 'BRAIN_RUNTIME_ERROR'; error: StepRuntimeError }
  | { type: 'INSPECT_TOGGLED'; enabled: boolean }
  /** The brain stopped; `startError` says why it couldn't start, while it stays stopped for that reason */
  | { type: 'BRAIN_KILLED'; startError?: string }
  /** The brain is running `rootFlowId`, the root flow it started with (a root flow changed since takes a restart) */
  | { type: 'BRAIN_STARTED'; rootFlowId: EARS.EntityId }
  | { type: 'BRAIN_PAUSED' }
  | { type: 'BRAIN_RESUMED' }

export interface BrainContext {
  brainActor?: any;
  eventQueue: Array<{ eventType: string; payload?: any; targetFlowId?: string }>;
  /** Why the brain last failed to start, while it stays stopped for that reason: part of each client's startup data */
  startError?: Error;
  /** Whether the start error was reported (a toast in every open window): once per failed start */
  startErrorReported: boolean;
  /** Whether a client has connected: before that, nothing receives what the brain sends */
  clientConnected: boolean;
  /** The root flow the running brain started with; undefined while it's stopped */
  runningRootFlowId?: EARS.EntityId;
}
