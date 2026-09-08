/**
 * Default-Setup DSL & Compiler Types
 *
 * Re-exports types needed by the default-setup package that aren't
 * reachable from the action/prompt service type graphs.
 * Bundled by rollup into default-setup-defs.d.ts.
 */

// EARS core types (for DSL authors via src/types.ts)
export { EARS, type BaseEntity } from '@/core/types';

// Flow DSL types (from SDK)
export {
  type FlowDSL, type FlowConfig, type Track, type DSLStepNode,
  type CompiledFlow, type CompiledEntity, type CompiledRelation, type CompiledRole,
  type CompilerContext,
  type ValidationError, type ValidationResult,
  isFlowConfig, resolveTracks, ROOT_FLOW_ROLE,
} from '@abuddy/sdk/build';

// Per-step DSL node types (pack-specific)
export type { DSLActionNode } from '@/extensions/steps/action/types';
export type { DSLLLMNode } from '@/extensions/steps/llm/types';
export type { DSLSwitchNode, DSLSwitchCondition } from '@/extensions/steps/switch/types';
export type { DSLFireNode } from '@/extensions/steps/fire/types';
export type { DSLTransformNode } from '@/extensions/steps/transform/types';
export type { DSLQueryNode } from '@/extensions/steps/query/types';
export type { DSLFlowNode } from '@/extensions/steps/subflow/types';
export type { DSLCreateNode } from '@/extensions/steps/create/types';
export type { DSLUpdateNode } from '@/extensions/steps/update/types';
export type { DSLKeepAliveNode } from '@/extensions/steps/keep-alive/types';
export type { DSLKillNode } from '@/extensions/steps/kill/types';

// Library content types (for DSL authors — also in action-defs but not exported there)
export type { ContentSection, ContentType, FieldContent, ListContent, MarkdownContent, TextContent, CodeContent } from '@/features/library/be/types';

// Library export types (for compiler)
export type { ExportedDocument, ExportedCollection, ExportedSymlink, ExportedItem, ExportedLibrary, ExportFormat } from '@/features/library/be/export-types';

// Thread UI types (for DSL authors)
export type { ButtonConfig, LinkConfig, LinkEvent, LinkIcon } from '@/features/threads/be/types';

// Notes export types (for compiler)
export type { ExportedNote, ExportedNotes } from '@/features/notes/be/export-types';

// Action/prompt authoring types (from SDK)
export type { ActionParameter, ActionMeta, TemplateInput, PromptMeta } from '@abuddy/sdk/build';
