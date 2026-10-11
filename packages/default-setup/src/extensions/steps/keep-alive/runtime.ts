import type { ExecutionContext, TNodeEntity } from '@apack/sdk/steps';

/**
 * The step's whole behaviour is to not finish: it never sends `COMPLETE`, so the flow stays at this node
 * until something else moves it. The handler has to be here rather than left out, because a step with no
 * handler at all is completed for it (`completeLater`, the brain's `node-handlers`) — which is the opposite.
 */
export function handler(_tNode: TNodeEntity, _node: unknown, _ctx: ExecutionContext, _actor: unknown): void {}
