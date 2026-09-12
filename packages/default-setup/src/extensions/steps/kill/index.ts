import type { StepDefinition, StepCompileResult, StepValidationError, StepValidationContext, StepCompileContext, StepDecompileContext, ExecutionContext, TNodeEntity } from '@abuddy/sdk/steps';
import { EARS } from '@abuddy/sdk';
import { killStepFE } from './fe';

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

function handler(_tNode: TNodeEntity, _node: unknown, ctx: ExecutionContext, actor: unknown) {
  const a = actor as { send: (event: any) => void };

  const flowActor = ctx.runtime.getFlowActor(ctx.flowTNodeId);
  if (flowActor) {
    flowActor.send({ type: 'KILL_FLOW' });
  }

  a.send({ type: 'COMPLETE', result: { killed: true } });
}

function decompile(node: Record<string, unknown>, _ctx: StepDecompileContext): Record<string, unknown> {
  const dsl: Record<string, unknown> = { type: 'kill' };
  if (node.label) dsl.label = node.label;
  if (node.description) dsl.description = node.description;
  return dsl;
}

export const killStep: StepDefinition = {
  type: 'kill',
  build: { compile, validate, getLabel, decompile },
  runtime: { handler },
  fe: killStepFE.fe,
};
