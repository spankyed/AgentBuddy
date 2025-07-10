import type { EARS } from '@abuddy/api'

/**
 * Configuration-based view model mapping system
 * Eliminates repetitive switch statements and provides a declarative way to transform nodes
 */

export interface RelationConfig {
  sourceField: string
  store: 'prompts' | 'actions' | 'models'
  targetField?: string // defaults to sourceField without 'Id' suffix
}

export interface NodeViewModelConfig {
  relations?: Record<string, RelationConfig>
  fields?: string[]
}

export const NODE_VIEW_MODEL_CONFIG: Record<string, NodeViewModelConfig> = {
  llm: {
    relations: {
      promptEntity: { sourceField: 'promptTemplateId', store: 'prompts' },
      model: { sourceField: 'model', store: 'models' }
    },
    fields: ['fieldMappings', 'temperature', 'maxTokens', 'systemPrompt', 'prompt']
  },
  action: {
    relations: {
      action: { sourceField: 'actionId', store: 'actions' }
    },
    fields: ['params', 'fieldMappings']
  },
  query: {
    fields: ['prompt', 'resultKey']
  },
  create: {
    fields: ['entityTypeTarget', 'entityId', 'inferLabel']
  },
  update: {
    fields: ['entityId', 'onMissing']
  },
  decision: {
    fields: ['conditions', 'elseLabel']
  },
  fire: {
    fields: ['eventType', 'payload', 'scope']
  },
  listen: {
    fields: ['mode', 'eventType', 'debounceMs', 'scope']
  },
  transform: {
    fields: ['script', 'outputType']
  },
  flow: {
    fields: ['flowRef', 'propagateCtx']
  },
  keep_alive: {
    fields: []
  }
}

export interface ViewModelStores {
  prompts: any[]
  actions: any[]
  models: any[]
}

/**
 * Generic node to view model transformation using configuration
 */
export function createNodeViewModel(
  node: any,
  stores: ViewModelStores,
  config: NodeViewModelConfig
): any {
  const extension: any = { type: node.nodeType }
  
  // Map relations
  if (config.relations) {
    Object.entries(config.relations).forEach(([targetKey, relationConfig]) => {
      const sourceValue = node[relationConfig.sourceField]
      if (sourceValue) {
        const store = stores[relationConfig.store]
        extension[targetKey] = store.find((entity: any) => entity.id === sourceValue)
      } else {
        extension[targetKey] = undefined
      }
    })
  }
  
  // Copy fields
  if (config.fields) {
    config.fields.forEach(field => {
      if (field in node) {
        extension[field] = node[field]
      }
    })
  }
  
  // Ensure required fields have defaults
  if (node.nodeType === 'llm' || node.nodeType === 'action') {
    extension.fieldMappings = extension.fieldMappings || []
  }
  
  return extension
} 