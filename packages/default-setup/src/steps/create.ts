import type { StepDefinition, StepCompileResult, StepValidationError, StepValidationContext, StepCompileContext } from '@abuddy/sdk/steps';
import { EARS } from '@/registries/ears';

function compile(node: Record<string, unknown>, nodeId: string, ts: number, _ctx: StepCompileContext): StepCompileResult {
  return {
    entity: {
      id: nodeId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'create',
      label: (node.label as string) || `Create ${node.entity}`,
      description: node.description,
      entityTypeTarget: node.entity as EARS.Entity,
      final: node.final,
    },
    relations: [],
  };
}

function validate(s: Record<string, unknown>, path: string, _ctx: StepValidationContext): StepValidationError[] {
  const errors: StepValidationError[] = [];
  if (!s.entity || typeof s.entity !== 'string') {
    errors.push({ path, message: 'Create step must have an "entity" string (entity type)' });
  }
  return errors;
}

function getLabel(step: Record<string, unknown>, index: number): string {
  if (typeof step.label === 'string') return step.label;
  return `Create ${step.entity || index}`;
}

export const createStep: StepDefinition = {
  type: 'create',
  build: { compile, validate, getLabel },
  fe: {
    colorKey: 'purple',
    nodeConfig: {
      label: 'Create',
      defaultLabel: 'Create entity',
      icon: 'Plus',
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      hoverBgColor: 'group-hover:bg-purple-500/15',
      connectionRules: { inputs: 1, outputs: 1 },
      component: 'VariableNode',
      category: 'data',
      isImplemented: false,
    },
    defaults: { inferLabel: true },
  },
};
