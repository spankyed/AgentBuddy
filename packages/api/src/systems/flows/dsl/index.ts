/**
 * Flow DSL Module
 *
 * A track-based, user-friendly format for defining workflows.
 * Each track represents an event listener + sequential response steps.
 */

export { compile, type CompiledRows } from './compiler';
export { validate } from './validator';
export { exportFlowsDSL } from './export-dsl';
export type {
  FlowDSL,
  Track,
  DSLStepNode,
  DSLStepNodeType,
  DSLActionNode,
  DSLLLMNode,
  DSLSwitchNode,
  DSLFireNode,
  DSLTransformNode,
  DSLQueryNode,
  DSLFlowNode,
  DSLCreateNode,
  DSLUpdateNode,
  DSLKeepAliveNode,
  CompilerContext,
  ValidationError,
  ValidationResult,
} from './types';
