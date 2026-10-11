import type { ExecutionContext, TNodeEntity } from '@apack/sdk/steps';

export function handler(_tNode: TNodeEntity, _node: unknown, ctx: ExecutionContext, actor: unknown): void {
  const a = actor as { send: (event: any) => void };

  const flowActor = ctx.runtime.getFlowActor(ctx.flowTNodeId);
  if (flowActor) {
    flowActor.send({ type: 'KILL_FLOW' });
  }

  a.send({ type: 'COMPLETE', result: { killed: true } });
}
