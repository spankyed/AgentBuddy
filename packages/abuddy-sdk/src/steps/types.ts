/**
 * Step Definition Contracts
 *
 * A step definition bundles everything a step type needs across
 * build (compile/validate/decompile), runtime (handler), and frontend (palette/canvas/form).
 * Packs register step definitions into the StepRegistry so the flows
 * and brain systems dispatch to them instead of hardcoded switches.
 */

/*─────────────────────────────────────────────────────────────────
 * Build-Time Types
 *─────────────────────────────────────────────────────────────────*/

export interface StepCompileContext {
  actions: Map<string, string>;
  prompts: Map<string, string>;
  flows: Map<string, string>;
}

export interface StepRelation {
  source: string;
  kind: string;
  target: string;
  info?: Record<string, unknown>;
}

export interface StepCompileResult {
  entity: Record<string, unknown>;
  relations: StepRelation[];
}

export interface StepValidationError {
  path: string;
  message: string;
}

export interface StepValidationContext {
  actions: Set<string>;
  prompts: Set<string>;
  flowNames: Set<string>;
  nodeLabels: Set<string>;
  path: string;
  skipReferenceCheck?: boolean;
}

export interface StepDecompileContext {
  actionMap: Map<string, string>;
  promptMap: Map<string, string>;
  flowMap: Map<string, string>;
  /** Resolve an inline branch chain from a source node's handle. Returns decompiled DSL steps or null. */
  resolveBranch?: (sourceNodeId: string, sourceHandle: string) => Record<string, unknown>[] | null;
}

export interface StepBranch {
  key: string;
  steps: Record<string, unknown>[];
}

export interface StepBuildFacet {
  compile(node: Record<string, unknown>, nodeId: string, ts: number, ctx: StepCompileContext): StepCompileResult;
  validate(step: Record<string, unknown>, path: string, ctx: StepValidationContext): StepValidationError[];
  getLabel(step: Record<string, unknown>, index: number): string;
  /** Entity → DSL node (reverse of compile). Omit → generic { type, label } fallback. */
  decompile?: (node: Record<string, unknown>, ctx: StepDecompileContext) => Record<string, unknown>;
  /** EARS relation config for this step type. Omit for steps with no entity relations. */
  relation?: { field: string; targetEntity: string };
  /** Return inline branch paths for steps that contain nested step lists. Omit for steps with no branching. */
  branches?: (dslNode: Record<string, unknown>) => StepBranch[];
}

/*─────────────────────────────────────────────────────────────────
 * Brain Runtime Types
 *
 * Shared types for execution context, trace nodes, and runtime
 * services. These live in the SDK so step handlers and external
 * packs get real types instead of `unknown` casts.
 *─────────────────────────────────────────────────────────────────*/

import type { BaseEntity, EARS } from '../types/entities.js';

export type TimestampMs = number;
export type EntityStatus = 'active' | 'paused' | 'completed' | 'failed';
export type TNodeKind = 'flow' | 'event' | 'step';

export interface TNodeEntity extends BaseEntity {
  entityType: EARS.Entity;
  tNodeType: TNodeKind;
  label: string;
  status: EntityStatus;
  startedAt: TimestampMs;
  completedAt?: TimestampMs;
  eventType?: string;
  triggerType?: string;
  cronExpression?: string;
  stepNodeType?: string;
  final?: boolean;
  nodeAttributes?: Record<string, unknown>;
  resolvedParams?: Record<string, unknown>;
  blueprint?: {
    nodeId: EARS.EntityId;
    flowId: EARS.EntityId;
  };
}

/** Entities whose shapes the SDK owns; every pack's generated PackShapes includes them. */
export type SdkEntityShapes = {
  TNode: TNodeEntity;
};

/**
 * One track's execution, as a tree: a persisted TNode with its SPAWNED children
 * hydrated in memory.
 *
 * Deliberately not named `TrackEntity` — `Track` is not a declared entity type,
 * and in this codebase an `XEntity` suffix means "shape of a persisted EARS
 * entity" (i.e. an entity in a pack's PackShapes). Not to be confused with `Track`
 * in build/compilers/flow-types.ts, which is the static DSL track definition.
 */
export interface TrackTree extends TNodeEntity {
  children: TrackTree[];
}

export interface ExecutionEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp?: TimestampMs;
  source?: string;
}

export interface StepRun {
  id?: string;
  label: string;
  result: unknown;
  timestamp: TimestampMs;
}

export interface RuntimeServices {
  getFlowActor: (flowTNodeId: EARS.EntityId) => any | undefined;
  getAppServices: () => any;
}

export interface ExecutionContext {
  flowTNodeId: EARS.EntityId;
  event: ExecutionEvent;
  steps: StepRun[];
  lastStep?: Omit<StepRun, 'timestamp'>;
  runtime: RuntimeServices;
}

export interface StepRuntimeError {
  errorId: string;
  message: string;
  stack?: string;
  source: string;
  phase: string;
  flowTNodeId?: EARS.EntityId;
  eventTNodeId?: EARS.EntityId;
  tNodeId?: EARS.EntityId;
  nodeId?: EARS.EntityId;
  nodeLabel?: string;
  nodeType?: string;
  actionId?: EARS.EntityId;
  actionLabel?: string;
  eventType?: string;
  timestamp: TimestampMs;
}

/*─────────────────────────────────────────────────────────────────
 * Runtime Types
 *─────────────────────────────────────────────────────────────────*/

export interface StepRuntimeFacet {
  /**
   * Executes the step.
   *
   * Generic conventions the brain honours from handler results:
   * - **Branching**: `{ sourceHandle: 'branch-N' }` → routes to named branch
   * - **No-match**: `{ noMatch: true }` → terminates the current chain
   * - **Kill**: send `KILL_FLOW` to `ctx.runtime.getFlowActor(flowTNodeId)`
   * - **Keep-alive**: never send COMPLETE → actor stays in executing state
   * - **Final**: set `final: true` on the compiled node → triggers flow completion
   */
  handler?: (tNode: TNodeEntity, node: unknown, executionContext: ExecutionContext, actor: unknown) => void | Promise<void>;
  isAsync?: boolean;
  /** When true, the brain spawns a sub-flow machine instead of a step machine. */
  spawnsSubflow?: boolean;
}

/*─────────────────────────────────────────────────────────────────
 * Frontend Types
 *─────────────────────────────────────────────────────────────────*/

export interface StepNodeConfig {
  label: string;
  defaultLabel?: string;
  icon: unknown;
  color: string;
  bgColor: string;
  hoverBgColor: string;
  connectionRules: { inputs: number; outputs: number };
  component?: string;
  category: 'trigger' | 'action' | 'logic' | 'data' | 'ai';
  isImplemented?: boolean;
  isDisabled?: boolean;
}

export interface StepLayoutDescriptor {
  getHeight?: (node: Record<string, unknown>, ctx: { exitCount?: number }) => number;
  getPorts?: (node: Record<string, unknown>, ctx: { exitCount?: number }) => Array<{ id: string; layoutOptions: Record<string, string> }>;
  hasInput?: boolean;
  usesExitCount?: boolean;
}

export interface StepFEFacet {
  nodeConfig: StepNodeConfig;
  colorKey?: string;
  defaults?: Record<string, unknown>;
  /** Vue component refs — populated by initComponents() from loadComponents factory. */
  components?: { node?: unknown; form?: unknown };
  /** Lazy factory that returns Vue components. Runs in FE context only. */
  loadComponents?: () => { node?: unknown; form?: unknown };
  /** Custom ELK layout descriptor (height/ports). Omit → default single-input single-output. */
  layout?: StepLayoutDescriptor;
  /** Handle prefix for multi-output steps (e.g. 'branch' → 'branch-0', 'branch-1'). */
  handlePrefix?: string;
  /** Keys from FormResources this step's form needs (e.g. ['actions', 'prompts']). */
  resourceKeys?: string[];
}

/*─────────────────────────────────────────────────────────────────
 * Trigger Types (registered triggers like schedule, webhook, etc.)
 *─────────────────────────────────────────────────────────────────*/

export interface TriggerFacet {
  /** Which DSL track field this trigger type owns (e.g. 'schedule'). Used by compiler to detect trigger type from track. */
  trackField: string;
  /** Compile DSL track into a trigger node entity. */
  compile(track: Record<string, unknown>, trackId: string, ts: number, trackKey: string): Record<string, unknown>;
  /** Decompile trigger node entity back to DSL track fields (e.g. { schedule: '0 * * * *' }). */
  decompile(node: Record<string, unknown>): Record<string, unknown>;
  /** Whether this trigger keeps the flow alive after all tracks drain. */
  persistent?: boolean;
  /** Register trigger-specific runtime hooks (e.g. cron jobs). Called per-node during registerFlowActor. */
  register?(node: TriggerRuntimeNode, ctx: TriggerRuntimeContext): void | Promise<void>;
  /** Additional entity fields needed when querying this trigger's nodes (e.g. ['cronExpression']). */
  queryFields?: string[];
  /** Validate a DSL track before compilation. */
  validateTrack?(track: Record<string, unknown>): { valid: boolean; errors: string[] };
  /** Validate a compiled trigger node entity on persist. */
  validate?(node: Record<string, unknown>): { valid: boolean; errors: string[] };
}

export interface TriggerRuntimeNode {
  id: string;
  label?: string;
  eventType: string;
  trackKey?: string;
  [key: string]: unknown;
}

export interface TriggerRuntimeContext {
  flowTNodeId: string;
  sendToBrainSystem: (event: { eventType: string; payload?: any; targetFlowId?: any }) => void;
}

/*─────────────────────────────────────────────────────────────────
 * Step Definition
 *─────────────────────────────────────────────────────────────────*/

export type { StepDSLMeta } from '../build/manifest.js';
import type { StepDSLMeta } from '../build/manifest.js';

export interface StepDefinition {
  type: string;
  kind?: 'step' | 'trigger';
  build?: StepBuildFacet;
  runtime?: StepRuntimeFacet;
  fe?: StepFEFacet;
  trigger?: TriggerFacet;
  dsl?: StepDSLMeta;
}
