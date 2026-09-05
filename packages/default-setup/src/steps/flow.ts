import type { StepDefinition, StepCompileResult, StepCompileContext, StepValidationError, StepValidationContext } from '@abuddy/sdk/steps';
import { EARS } from '@/registries/ears';
import { expandFieldMappings } from './shared';

function compile(
  node: Record<string, unknown>,
  nodeId: string,
  ts: number,
  ctx: StepCompileContext,
): StepCompileResult {
  const flowRef = ctx.flows.get(node.flow as string) || (node.flow as string);
  return {
    entity: {
      id: nodeId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'flow',
      label: (node.label as string) || (node.flow as string),
      description: node.description,
      flowRef,
      propagateCtx: node.inherit !== false,
      fieldMappings: expandFieldMappings(node.map as Record<string, string> | undefined),
      final: node.final,
    },
    relations: [],
  };
}

function validate(
  s: Record<string, unknown>,
  path: string,
  _ctx: StepValidationContext,
): StepValidationError[] {
  const errors: StepValidationError[] = [];
  if (!s.flow || typeof s.flow !== 'string') {
    errors.push({ path, message: 'Flow step must have a "flow" string (sub-flow name)' });
  }
  return errors;
}

function getLabel(step: Record<string, unknown>, index: number): string {
  if (typeof step.label === 'string') return step.label;
  return (step.flow as string) || `Flow ${index}`;
}

export const flowStep: StepDefinition = {
  type: 'flow',
  build: { compile, validate, getLabel },
  runtime: { spawnsSubflow: true },
  fe: {
    colorKey: 'purple',
    nodeConfig: {
      label: 'Flow',
      defaultLabel: 'Handle flow',
      icon: 'Workflow',
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      hoverBgColor: 'group-hover:bg-purple-500/15',
      connectionRules: { inputs: 1, outputs: 1 },
      component: 'VariableNode',
      category: 'logic',
      isImplemented: true,
    },
    defaults: { propagateCtx: true },
  },
};
