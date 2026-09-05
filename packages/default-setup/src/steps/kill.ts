import type { StepDefinition, StepCompileResult, StepValidationError, StepValidationContext, StepCompileContext } from '@abuddy/sdk/steps';
import type { ExecutionContext } from '@/plugins/brain/be/types';
import { EARS } from '@/registries/ears';

function compile(node: Record<string, unknown>, nodeId: string, ts: number, _ctx: StepCompileContext): StepCompileResult {
  return {
    entity: {
      id: nodeId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'kill',
      label: (node.label as string) || 'Kill Flow',
      description: node.description,
    },
    relations: [],
  };
}

function validate(_s: Record<string, unknown>, _path: string, _ctx: StepValidationContext): StepValidationError[] {
  return [];
}

function getLabel(step: Record<string, unknown>, index: number): string {
  if (typeof step.label === 'string') return step.label;
  return `Kill Flow ${index}`;
}

function handler(_tNode: unknown, _node: unknown, executionContext: unknown, actor: unknown) {
  const ctx = executionContext as ExecutionContext;
  const a = actor as { send: (event: any) => void };

  const flowActor = ctx.runtime.getFlowActor(ctx.flowTNodeId);
  if (flowActor) {
    flowActor.send({ type: 'KILL_FLOW' });
  }

  a.send({ type: 'COMPLETE', result: { killed: true } });
}

export const killStep: StepDefinition = {
  type: 'kill',
  build: { compile, validate, getLabel },
  runtime: { handler },
  fe: {
    colorKey: 'red',
    nodeConfig: {
      label: 'Kill',
      defaultLabel: 'Kill flow',
      icon: 'Plug',
      color: 'text-red-400',
      bgColor: 'bg-red-500/10',
      hoverBgColor: 'group-hover:bg-red-500/15',
      connectionRules: { inputs: 1, outputs: 0 },
      component: 'VariableNode',
      category: 'logic',
      isImplemented: true,
    },
  },
};
