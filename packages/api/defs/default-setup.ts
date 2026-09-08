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

// Per-step DSL node types (auto-generated from abuddy.json)
export type * from '@/__generated__/step-types';

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
