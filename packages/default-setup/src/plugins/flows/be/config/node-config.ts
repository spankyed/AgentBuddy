import type { NodeKind, NodeEntity } from './types';
import { EARS } from '@/registries/ears';
import { Cron } from 'croner';
import { stepRegistry } from '@abuddy/sdk/steps';

export interface NodeMetadata {
  nodeType: NodeKind;
  label: string;
  description: string;
  category: 'trigger' | 'action' | 'logic' | 'data' | 'ai';
  validation?: {
    requiredFields?: string[];
    customValidator?: (node: NodeEntity) => boolean;
  };
  defaults?: Partial<NodeEntity>;
}

const TRIGGER_TYPES = new Set(['listener', 'schedule']);

export function isTriggerNodeType(nodeType: string): boolean {
  return TRIGGER_TYPES.has(nodeType);
}

const triggerMetadata: Record<string, NodeMetadata> = {
  listener: {
    nodeType: 'listener',
    label: 'Listener',
    description: 'Listener for events to trigger flows',
    category: 'trigger',
    validation: {
      requiredFields: ['eventType', 'scope'],
    },
    defaults: {
      scope: 'global',
    } as any,
  },
  schedule: {
    nodeType: 'schedule',
    label: 'Schedule',
    description: 'Trigger flow on a cron schedule',
    category: 'trigger',
    validation: {
      requiredFields: ['cronExpression'],
      customValidator: (node) => {
        const cronExpression = (node as any).cronExpression;
        if (typeof cronExpression !== 'string' || cronExpression.trim().length === 0) {
          return false;
        }

        const parts = cronExpression.trim().split(/\s+/);
        if (parts.length < 5 || parts.length > 6) {
          return false;
        }

        try {
          new Cron(cronExpression);
          return true;
        } catch {
          return false;
        }
      },
    },
    defaults: {
      cronExpression: '0 * * * *',
    } as any,
  },
};

// Backward-compatible record — reads from registry for step types, triggerMetadata for triggers
export const nodeMetadata: Record<string, NodeMetadata> = new Proxy(triggerMetadata, {
  get(target, prop: string) {
    if (prop in target) return target[prop];

    const stepDef = stepRegistry.get(prop);
    if (stepDef?.fe) {
      return {
        nodeType: prop,
        label: stepDef.fe.nodeConfig.label,
        description: '',
        category: stepDef.fe.nodeConfig.category,
        defaults: stepDef.fe.defaults,
      } as NodeMetadata;
    }
    return undefined;
  },
  has(target, prop: string) {
    return prop in target || stepRegistry.has(prop);
  },
});

export function getNodeMetadata(nodeType: NodeKind): NodeMetadata | undefined {
  return nodeMetadata[nodeType];
}

export function validateNode(node: NodeEntity): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const metadata = nodeMetadata[node.nodeType];

  if (!metadata) {
    return { valid: true, errors };
  }

  if (metadata.validation?.requiredFields) {
    for (const field of metadata.validation.requiredFields) {
      if (!(field in node) || (node as any)[field] === undefined) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  if (metadata.validation?.customValidator) {
    if (!metadata.validation.customValidator(node)) {
      errors.push(`Custom validation failed for ${node.nodeType}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function createNodeDefaults(nodeType: NodeKind): Partial<NodeEntity> {
  const stepDef = stepRegistry.get(nodeType);
  if (stepDef?.fe) {
    return {
      nodeType,
      label: stepDef.fe.nodeConfig.label,
      entityType: EARS.Entity.Node,
      ...stepDef.fe.defaults,
    } as Partial<NodeEntity>;
  }

  const metadata = triggerMetadata[nodeType];
  if (metadata) {
    return {
      nodeType,
      label: metadata.label,
      entityType: EARS.Entity.Node,
      ...metadata.defaults,
    } as Partial<NodeEntity>;
  }

  return {
    nodeType,
    entityType: EARS.Entity.Node,
  } as Partial<NodeEntity>;
}

export const allNodeTypes = [
  ...Object.keys(triggerMetadata),
  ...stepRegistry.types(),
] as NodeKind[];
