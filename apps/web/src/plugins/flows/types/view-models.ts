import type { NodeKind, EARS } from '@abuddy/api'

/**
 * View model types for UI components
 * These are essentially DTOs that shape data for convenient UI consumption
 */

// Field mapping interface shared by multiple node types
export interface FieldMapping {
  target: string
  source: string
  default?: any
}

// Base view model for all nodes
export interface NodeViewModel {
  id: EARS.EntityId
  nodeType: NodeKind
  label: string
  position?: { x: number; y: number }
  extension?: NodeExtensionView
}

// Union of all possible extension views
export type NodeExtensionView = 
  | LLMNodeView 
  | ActionNodeView
  | QueryNodeView
  | CreateNodeView
  | UpdateNodeView
  | DecisionNodeView
  | FireNodeView
  | ListenNodeView
  | TransformNodeView
  | FlowNodeView
  | KeepAliveNodeView

// Node-specific view models
export interface LLMNodeView {
  type: 'llm'
  promptEntity?: any      // PromptEntity
  model?: any             // ModelConfig
  fieldMappings: FieldMapping[]
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
  prompt?: string
}

export interface ActionNodeView {
  type: 'action'
  action?: any           // ActionEntity
  params?: Record<string, any>
  fieldMappings: FieldMapping[]
}

export interface QueryNodeView {
  type: 'query'
  prompt: string
  resultKey?: string
}

export interface CreateNodeView {
  type: 'create'
  entityTypeTarget: any  // EARS.Entity
  entityId?: string
  inferLabel?: boolean
}

export interface UpdateNodeView {
  type: 'update'
  entityId: string
  onMissing?: 'fail' | 'ignore' | 'create'
}

export interface DecisionNodeView {
  type: 'decision'
  conditions: Array<{ expr: string; label?: string }>
  elseLabel?: string
}

export interface FireNodeView {
  type: 'fire'
  eventType: string
  payload?: unknown
  scope?: 'local' | 'global'
}

export interface ListenNodeView {
  type: 'listen'
  mode: 'entry' | 'internal'
  eventType: string
  debounceMs?: number
  scope?: 'local' | 'global'
}

export interface TransformNodeView {
  type: 'transform'
  script: string
  outputType?: 'json' | 'text' | 'custom'
}

export interface FlowNodeView {
  type: 'flow'
  flowRef: string
  propagateCtx?: boolean
}

export interface KeepAliveNodeView {
  type: 'keep_alive'
}

// Helper to create default field mappings from template inputs
export function createDefaultMappings(
  fields?: Record<string, any>
): FieldMapping[] {
  if (!fields) return []
  
  return Object.keys(fields).map(key => ({
    target: key,
    source: '',
    default: undefined,
  }))
}