/**
 * Flow DSL Types
 *
 * A succinct, user-friendly format for defining workflows that compiles
 * into the EARS database format.
 *
 * Format: Track-based DSL where each track is an event + response steps.
 */

import type { EARS } from '@/core/types';

/*─────────────────────────────────────────────────────────────────
 * DSL Document Structure
 *─────────────────────────────────────────────────────────────────*/

/**
 * Top-level DSL structure: flow name → array of tracks
 */
export type FlowDSL = Record<string, Track[]>;

/**
 * A track represents an event listener + its sequential response steps.
 * The event field creates an implicit listen node.
 */
export interface Track {
  /** Event type to listen for (creates a listen node) */
  event: string;
  /** Optional label for the listen node (defaults to event type) */
  label?: string;
  /** Optional description for the listen node */
  description?: string;
  /** Sequential response steps (no listen nodes allowed here) */
  steps: DSLStepNode[];
}

/*─────────────────────────────────────────────────────────────────
 * Step Node Definitions (User-Friendly Format)
 *─────────────────────────────────────────────────────────────────*/

/** Common fields for all step nodes */
interface DSLNodeBase {
  label?: string;
  description?: string;
  final?: boolean;
  next?: string;  // Override sequential flow - go to this label instead
}

/** Execute a predefined action */
export interface DSLActionNode extends DSLNodeBase {
  type: 'action';
  action: string;  // Action name (resolved by compiler)
  map?: Record<string, string>;  // Field mappings: { target: source }
  params?: Record<string, any>;  // Static parameters
}

/** Process with AI language model */
export interface DSLLLMNode extends DSLNodeBase {
  type: 'llm';
  prompt: string;  // Prompt template name (resolved by compiler)
  map?: Record<string, string>;  // Field mappings for template inputs
  model?: string;  // Optional model override
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

/** Switch condition with inline branch steps */
export interface DSLSwitchCondition {
  if: string;            // Expression to evaluate
  steps: DSLStepNode[];  // Inline steps for this branch
}

/** Else branch: inline steps */
export type DSLSwitchElse = DSLStepNode[];

/** Branch flow based on conditions */
export interface DSLSwitchNode extends DSLNodeBase {
  type: 'switch';
  conditions: DSLSwitchCondition[];
  else?: DSLSwitchElse;
}

/** Emit an event */
export interface DSLFireNode extends DSLNodeBase {
  type: 'fire';
  event: string;  // Event type to emit
  scope?: 'local' | 'global';  // Default: 'local'
  payload?: unknown;
}

/** Transform data using script */
export interface DSLTransformNode extends DSLNodeBase {
  type: 'transform';
  script: string;
  outputType?: 'json' | 'text' | 'custom';
}

/** Query data using natural language */
export interface DSLQueryNode extends DSLNodeBase {
  type: 'query';
  prompt: string;
  as?: string;  // Result key name (resultKey)
}

/** Execute a sub-flow */
export interface DSLFlowNode extends DSLNodeBase {
  type: 'flow';
  flow: string;  // Sub-flow name
  inherit?: boolean;  // Propagate context (default: true)
  map?: Record<string, string>;  // Field mappings for entry params
}

/** Create an entity */
export interface DSLCreateNode extends DSLNodeBase {
  type: 'create';
  entity: string;  // Entity type (e.g., 'Node')
}

/** Update an entity */
export interface DSLUpdateNode extends DSLNodeBase {
  type: 'update';
  target: string;  // Label of create node to update
  onMissing?: 'fail' | 'ignore' | 'create';
}

/** Keep flow instance alive */
export interface DSLKeepAliveNode extends DSLNodeBase {
  type: 'keep_alive';
}

/**
 * Union of all step node types (excludes listen - that's implicit in Track.event)
 */
export type DSLStepNode =
  | DSLActionNode
  | DSLLLMNode
  | DSLSwitchNode
  | DSLFireNode
  | DSLTransformNode
  | DSLQueryNode
  | DSLFlowNode
  | DSLCreateNode
  | DSLUpdateNode
  | DSLKeepAliveNode;

/** Step node type discriminator */
export type DSLStepNodeType = DSLStepNode['type'];

/*─────────────────────────────────────────────────────────────────
 * Compiler Output Types
 *─────────────────────────────────────────────────────────────────*/

export interface CompiledFlow {
  entity: CompiledEntity[];
  relation: CompiledRelation[];
  role: CompiledRole[];
}

export interface CompiledEntity {
  id: string;
  entityType: EARS.Entity;
  [key: string]: any;
}

export interface CompiledRelation {
  source: string;
  kind: EARS.RelKind;
  target: string;
  info?: Record<string, any>;
}

export interface CompiledRole {
  entityId: string;
  role: string;
}

/*─────────────────────────────────────────────────────────────────
 * Compiler Context (for reference resolution)
 *─────────────────────────────────────────────────────────────────*/

export interface CompilerContext {
  /** Map action label -> action ID */
  actions: Map<string, string>;
  /** Map prompt label -> prompt ID */
  prompts: Map<string, string>;
  /** Map flow label -> flow ID (for sub-flow references) */
  flows: Map<string, string>;
}

/*─────────────────────────────────────────────────────────────────
 * Validation Types
 *─────────────────────────────────────────────────────────────────*/

export interface ValidationError {
  path: string;  // e.g., "My Flow[0].steps[2]"
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
