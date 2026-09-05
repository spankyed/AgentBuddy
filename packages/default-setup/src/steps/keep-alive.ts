import type { StepDefinition, StepCompileResult, StepValidationError, StepValidationContext, StepCompileContext } from '@abuddy/sdk/steps';
import { EARS } from '@/registries/ears';

function compile(node: Record<string, unknown>, nodeId: string, ts: number, _ctx: StepCompileContext): StepCompileResult {
  return {
    entity: {
      id: nodeId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'keep_alive',
      label: (node.label as string) || 'Keep Alive',
      description: node.description,
      final: node.final,
    },
    relations: [],
  };
}

function validate(_s: Record<string, unknown>, _path: string, _ctx: StepValidationContext): StepValidationError[] {
  return [];
}

function getLabel(step: Record<string, unknown>, index: number): string {
  if (typeof step.label === 'string') return step.label;
  return `Keep Alive ${index}`;
}

export const keepAliveStep: StepDefinition = {
  type: 'keep_alive',
  build: { compile, validate, getLabel },
  runtime: {
    handler() {},
  },
  fe: {
    colorKey: 'emerald',
    nodeConfig: {
      label: 'Keep alive',
      defaultLabel: 'Keep alive',
      icon: 'Activity',
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      hoverBgColor: 'group-hover:bg-emerald-500/15',
      connectionRules: { inputs: 1, outputs: 0 },
      component: 'VariableNode',
      category: 'logic',
      isImplemented: true,
    },
  },
};
