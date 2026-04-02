/**
 * Default-Setup DSL & Compiler Types
 *
 * Re-exports types needed by the default-setup package that aren't
 * reachable from the action/prompt service type graphs.
 * Bundled by rollup into default-setup-defs.d.ts.
 */

// EARS core types (for DSL authors via src/types.ts)
export { EARS, type BaseEntity } from '@/core/types';

// Flow DSL types (for DSL authors writing flows)
export {
  type FlowDSL, type FlowConfig, type Track, type DSLStepNode,
  type DSLActionNode, type DSLLLMNode, type DSLSwitchNode,
  type DSLSwitchCondition, type DSLFireNode, type DSLTransformNode,
  type DSLQueryNode, type DSLFlowNode, type DSLCreateNode,
  type DSLUpdateNode, type DSLKeepAliveNode,
  type CompiledFlow, type CompiledEntity, type CompiledRelation, type CompiledRole,
  type CompilerContext,
  type ValidationError, type ValidationResult,
  isFlowConfig, resolveTracks, ROOT_FLOW_ROLE,
} from '@/systems/flows/dsl/types';

// Library content types (for DSL authors — also in action-defs but not exported there)
export type { ContentSection, ContentType, FieldContent, ListContent, MarkdownContent, TextContent, CodeContent } from '@/systems/library/types';

// Library export types (for compiler)
export type { ExportedDocument, ExportedCollection, ExportedSymlink, ExportedItem, ExportedLibrary, ExportFormat } from '@/systems/library/export-types';

// Thread UI types (for DSL authors)
export type { ButtonConfig, LinkConfig, LinkEvent, LinkIcon } from '@/systems/threads/types';

// Notes export types (for compiler)
export type { ExportedNote, ExportedNotes } from '@/systems/notes/export-types';
