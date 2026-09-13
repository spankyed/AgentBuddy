import type { StepDefinition, ExecutionContext, TNodeEntity } from '@abuddy/sdk/steps';
import { killStepBuild } from './build';
import { killStepFE } from './fe';

function handler(_tNode: TNodeEntity, _node: unknown, ctx: ExecutionContext, actor: unknown) {
  const a = actor as { send: (event: any) => void };

  const flowActor = ctx.runtime.getFlowActor(ctx.flowTNodeId);
  if (flowActor) {
    flowActor.send({ type: 'KILL_FLOW' });
  }

  a.send({ type: 'COMPLETE', result: { killed: true } });
}

export const killStep: StepDefinition = {
  ...killStepBuild,
  runtime: { handler },
  fe: killStepFE.fe,
};
