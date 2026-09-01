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
} from '@/plugins/flows/be/dsl/types';

// Library content types (for DSL authors — also in action-defs but not exported there)
export type { ContentSection, ContentType, FieldContent, ListContent, MarkdownContent, TextContent, CodeContent } from '@/plugins/library/be/types';

// Library export types (for compiler)
export type { ExportedDocument, ExportedCollection, ExportedSymlink, ExportedItem, ExportedLibrary, ExportFormat } from '@/plugins/library/be/export-types';

// Thread UI types (for DSL authors)
export type { ButtonConfig, LinkConfig, LinkEvent, LinkIcon } from '@/plugins/threads/be/types';

// Notes export types (for compiler)
export type { ExportedNote, ExportedNotes } from '@/plugins/notes/be/export-types';

// Action/prompt authoring types
export type { ActionParameter } from '@/plugins/actions/be/types';
export type { TemplateInput } from '@/plugins/prompts/be/types';

// Convenience meta interfaces for DSL authoring
import type { ActionParameter as _ActionParameter } from '@/plugins/actions/be/types';
import type { TemplateInput as _TemplateInput } from '@/plugins/prompts/be/types';

export interface ActionMeta {
  label: string;
  description?: string;
  category?: string;
  input: Record<string, _ActionParameter>;
  output?: any;
}

export interface PromptMeta {
  label: string;
  description?: string;
  category?: string;
  inputs: Record<string, _TemplateInput>;
  outputSchema?: any;
}
