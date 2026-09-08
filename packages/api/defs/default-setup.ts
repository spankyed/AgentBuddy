/**
 * Default-Setup DSL & Compiler Types
 *
 * Bundled by rollup into default-setup-defs.d.ts.
 * All pack-specific types flow through generated barrels.
 */

export { EARS, type BaseEntity } from '@/core/types';

export {
  type FlowDSL, type FlowConfig, type Track, type DSLStepNode,
  type CompiledFlow, type CompiledEntity, type CompiledRelation, type CompiledRole,
  type CompilerContext,
  type ValidationError, type ValidationResult,
  isFlowConfig, resolveTracks, ROOT_FLOW_ROLE,
  type ActionParameter, type ActionMeta, type TemplateInput, type PromptMeta,
} from '@abuddy/sdk/build';

export type * from '@/__generated__/step-types';
export type * from '@/__generated__/types';
