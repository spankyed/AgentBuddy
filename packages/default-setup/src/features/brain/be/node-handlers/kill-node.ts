import type { NodeEntity } from '@/core/shared-types/flows';
import type { ExecutionContext, TNodeEntity } from '@/systems/brain/types';
import { getFlowActor } from '../flow-system';
import { brainInspect } from '../utils/brain-inspect';

/**
 * Handle execution of a kill node
 * Kill nodes terminate the containing flow by sending KILL_FLOW
 */
export function killNodeHandler(
  tNode: TNodeEntity,
  node: NodeEntity,
  executionContext: ExecutionContext,
  actor: any
) {
  brainInspect(`Kill node: ${node.label} - terminating flow`);

  const flowActor = getFlowActor(executionContext.flowTNodeId);
  if (flowActor) {
    flowActor.send({ type: 'KILL_FLOW' });
  }

  actor.send({ type: 'COMPLETE', result: { killed: true } });
}
