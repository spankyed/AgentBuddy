import type { ExecutionContext, RunNode } from '@apackdev/sdk/steps';

export function handler(_tNode: RunNode, _node: unknown, ctx: ExecutionContext, actor: unknown): void {
  const a = actor as { send: (event: any) => void };

  const flowActor = ctx.runtime.getFlowActor(ctx.flowRunNodeId);
  if (flowActor) {
    flowActor.send({ type: 'KILL_FLOW' });
  }

  a.send({ type: 'COMPLETE', result: { killed: true } });
}
