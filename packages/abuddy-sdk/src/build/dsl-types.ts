/**
 * Flow DSL type definitions used by the build pipeline.
 * Standalone copy — no dependency on default-setup/defs.
 */

export type FlowDSL = Record<string, Track[] | FlowConfig>;

export interface FlowConfig {
  tracks: Track[];
  root?: boolean;
  sourceHash?: string;
}

export interface Track {
  event?: string;
  schedule?: string;
  label?: string;
  description?: string;
  exits: DSLStepNode[][];
}

interface DSLNodeBase {
  label?: string;
  description?: string;
  final?: boolean;
  next?: string;
}

export interface DSLActionNode extends DSLNodeBase {
  type: 'action';
  action: string;
  map?: Record<string, string>;
  params?: Record<string, any>;
}

interface DSLLLMNode extends DSLNodeBase {
  type: 'llm';
  prompt: string;
  map?: Record<string, string>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface DSLSwitchCondition {
  if: string;
  steps: DSLStepNode[];
}

type DSLSwitchElse = DSLStepNode[];

interface DSLSwitchNode extends DSLNodeBase {
  type: 'switch';
  conditions: DSLSwitchCondition[];
  else?: DSLSwitchElse;
}

export interface DSLFireNode extends DSLNodeBase {
  type: 'fire';
  event: string;
  scope?: 'local' | 'global';
  payload?: unknown;
}

interface DSLTransformNode extends DSLNodeBase {
  type: 'transform';
  script: string;
  outputType?: 'json' | 'text' | 'custom';
}

interface DSLQueryNode extends DSLNodeBase {
  type: 'query';
  prompt: string;
  as?: string;
}

interface DSLFlowNode extends DSLNodeBase {
  type: 'flow';
  flow: string;
  inherit?: boolean;
  map?: Record<string, string>;
}

interface DSLCreateNode extends DSLNodeBase {
  type: 'create';
  entity: string;
}

interface DSLUpdateNode extends DSLNodeBase {
  type: 'update';
  target: string;
  onMissing?: 'fail' | 'ignore' | 'create';
}

export interface DSLKeepAliveNode extends DSLNodeBase {
  type: 'keep_alive';
}

interface DSLKillNode extends DSLNodeBase {
  type: 'kill';
}

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
  | DSLKeepAliveNode
  | DSLKillNode;

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ContentSection {
  type: 'field' | 'list' | 'markdown' | 'text' | 'code';
  [key: string]: any;
}

export interface ExportedDocument {
  id?: string;
  type: 'document';
  name: string;
  content: ContentSection[];
  tags: string[];
  sourceHash?: string;
}

export interface ExportedCollection {
  id?: string;
  type: 'collection';
  name: string;
  description?: string;
  children: ExportedItem[];
  sourceHash?: string;
}

export interface ExportedSymlink {
  id?: string;
  type: 'symlink';
  name: string;
  symlinkPath: string;
}

export type ExportedItem = ExportedDocument | ExportedCollection | ExportedSymlink;

export interface ExportedLibrary {
  version: number;
  items: ExportedItem[];
}

export interface ExportedNote {
  id?: string;
  type: 'document' | 'tasklist' | 'task';
  title: string;
  content: string;
  icon: string | null;
  completed: boolean;
  hideCompletedChildren: boolean;
  favorite: boolean;
  displayOrder?: number;
  savedDisplayOrder?: number;
  children: ExportedNote[];
}

export interface ExportedNotes {
  version: number;
  notes: ExportedNote[];
}

export interface CompiledFAQ {
  id: string;
  question: string;
  answer: string;
  category?: string;
  order?: number;
}
