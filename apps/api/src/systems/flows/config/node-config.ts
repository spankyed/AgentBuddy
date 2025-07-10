import { NodeKind, NodeEntity } from './types';
import { EARS } from '@/shared/ears/types';

export interface NodeMetadata {
  nodeType: NodeKind;
  label: string;
  description: string;
  category: 'trigger' | 'action' | 'logic' | 'data' | 'ai';
  // Node validation rules
  validation?: {
    requiredFields?: string[];
    customValidator?: (node: NodeEntity) => boolean;
  };
  // Default values for new nodes
  defaults?: Partial<NodeEntity>;
}

// Centralized node metadata configuration
export const nodeMetadata: Record<NodeKind, NodeMetadata> = {
  listen: {
    nodeType: 'listen',
    label: 'Listen',
    description: 'Listen for events to trigger flows',
    category: 'trigger',
    validation: {
      requiredFields: ['eventType', 'mode'],
    },
    defaults: {
      mode: 'entry',
      scope: 'local',
    } as any,
  },
  fire: {
    nodeType: 'fire',
    label: 'Fire Event',
    description: 'Fire an event with optional payload',
    category: 'action',
    validation: {
      requiredFields: ['eventType'],
    },
    defaults: {
      scope: 'local',
    } as any,
  },
  action: {
    nodeType: 'action',
    label: 'Action',
    description: 'Execute a predefined action',
    category: 'action',
    validation: {
      requiredFields: ['actionName'],
    },
  },
  create: {
    nodeType: 'create',
    label: 'Create',
    description: 'Create a new entity',
    category: 'data',
    validation: {
      requiredFields: ['entityTypeTarget'],
    },
    defaults: {
      inferLabel: true,
    } as any,
  },
  update: {
    nodeType: 'update',
    label: 'Update',
    description: 'Update an existing entity',
    category: 'data',
    validation: {
      requiredFields: ['entityId'],
    },
    defaults: {
      onMissing: 'fail',
    } as any,
  },
  query: {
    nodeType: 'query',
    label: 'Query',
    description: 'Query data using natural language',
    category: 'data',
    validation: {
      requiredFields: ['prompt'],
    },
  },
  decision: {
    nodeType: 'decision',
    label: 'Decision',
    description: 'Branch flow based on conditions',
    category: 'logic',
    validation: {
      requiredFields: ['conditions'],
      customValidator: (node) => {
        const decisionNode = node as any;
        return Array.isArray(decisionNode.conditions) && decisionNode.conditions.length > 0;
      },
    },
  },
  transform: {
    nodeType: 'transform',
    label: 'Transform',
    description: 'Transform data using scripts',
    category: 'data',
    validation: {
      requiredFields: ['script'],
    },
    defaults: {
      outputType: 'json',
    } as any,
  },
  flow: {
    nodeType: 'flow',
    label: 'Sub-flow',
    description: 'Execute another flow',
    category: 'logic',
    validation: {
      requiredFields: ['flowRef'],
    },
    defaults: {
      propagateCtx: true,
    } as any,
  },
  keep_alive: {
    nodeType: 'keep_alive',
    label: 'Keep Alive',
    description: 'Keep the flow instance active',
    category: 'logic',
  },
  llm: {
    nodeType: 'llm',
    label: 'LLM',
    description: 'Process with AI language model',
    category: 'ai',
    validation: {
      requiredFields: ['prompt'],
    },
    defaults: {
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 1000,
    } as any,
  },
};

// Helper functions
export function getNodeMetadata(nodeType: NodeKind): NodeMetadata {
  return nodeMetadata[nodeType];
}

export function validateNode(node: NodeEntity): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const metadata = nodeMetadata[node.nodeType];
  
  if (!metadata) {
    errors.push(`Unknown node type: ${node.nodeType}`);
    return { valid: false, errors };
  }
  
  // Check required fields
  if (metadata.validation?.requiredFields) {
    for (const field of metadata.validation.requiredFields) {
      if (!(field in node) || (node as any)[field] === undefined) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }
  
  // Run custom validator
  if (metadata.validation?.customValidator) {
    if (!metadata.validation.customValidator(node)) {
      errors.push(`Custom validation failed for ${node.nodeType}`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}

export function createNodeDefaults(nodeType: NodeKind): Partial<NodeEntity> {
  const metadata = nodeMetadata[nodeType];
  return {
    nodeType,
    label: metadata.label,
    entityType: EARS.Entity.Node,
    ...metadata.defaults,
  } as Partial<NodeEntity>;
}

// Export all node types for iteration
export const allNodeTypes = Object.keys(nodeMetadata) as NodeKind[]; 