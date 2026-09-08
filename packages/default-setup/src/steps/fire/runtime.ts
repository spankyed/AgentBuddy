import type { TNodeEntity, ExecutionContext } from '@abuddy/sdk/steps';
import { sendToBrainSystem } from '@abuddy/sdk/services';

export function handler(tNode: TNodeEntity, _node: unknown, ctx: ExecutionContext, actor: unknown) {
  const a = actor as { send: (event: any) => void };

  const fireConfig = tNode.nodeAttributes || {};

  if (!fireConfig.eventType) {
    a.send({ type: 'ERROR', error: 'Missing eventType' });
    return;
  }

  const scope = fireConfig.scope || 'local';
  const eventType = fireConfig.eventType as string;
  const payload = fireConfig.payload;
  const targetFlowId = scope === 'local' ? ctx.flowTNodeId : undefined;

  try {
    sendToBrainSystem({ eventType, payload, targetFlowId });
    a.send({
      type: 'COMPLETE',
      result: { eventFired: eventType, eventScope: scope, targetFlowId, payload },
    });
  } catch {
    a.send({ type: 'ERROR', error: 'Failed to fire event' });
  }
}
