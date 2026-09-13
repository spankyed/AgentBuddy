/**
 * Flow Infrastructure Types
 *
 * Base entity shapes and compiler output types for the flow compilation pipeline.
 * Per-step entity specializations (ActionNode, LLMNode, etc.) are owned by
 * each step definition in the pack.
 */

import type { BaseEntity, EARS } from '../../types/entities.js';

/*─────────────────────────────────────────────────────────────────
 * Base entity shapes
 *─────────────────────────────────────────────────────────────────*/

export interface FlowEntity extends BaseEntity {
  entityType: EARS.Entity;
  shortCode: string;
  label: string;
  description?: string;
  flowType: 'workflow' | 'integration';
  sourceHash?: string;
}

export interface NodeBase extends BaseEntity {
  entityType: EARS.Entity;
  nodeType: string;
  label: string;
  description?: string;
  color?: string;
  final?: boolean;
}

export type EdgeEntity = {
  id: EARS.EntityId;
  kind: EARS.RelKind;
  source: EARS.EntityId;
  target: EARS.EntityId;
  sourceHandle?: string;
  targetHandle?: string;
  info?: Record<string, any>;
};

/*─────────────────────────────────────────────────────────────────
 * Compiler output types
 *─────────────────────────────────────────────────────────────────*/

export interface CompilerContext {
  actions: Map<string, string>;
  prompts: Map<string, string>;
  flows: Map<string, string>;
}

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
