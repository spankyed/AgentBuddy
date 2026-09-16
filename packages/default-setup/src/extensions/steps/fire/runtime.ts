import type { TNodeEntity, ExecutionContext } from '@abuddy/sdk/steps';
import { sendToBrainSystem } from '@abuddy/sdk/services';
import { extractValueByPath } from '@abuddy/sdk/utils';
import type { FireNode } from './types';

/** A payload with its `$.` paths resolved against the execution context, at any depth; other values as they are */
function resolvePayload(value: unknown, ctx: ExecutionContext): unknown {
  if (typeof value === 'string') return value.startsWith('$.') ? extractValueByPath(ctx, value) : value;
  if (Array.isArray(value)) return value.map((item) => resolvePayload(item, ctx));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolvePayload(item, ctx)]));
  }
  return value;
}

export function handler(tNode: TNodeEntity, node: unknown, ctx: ExecutionContext, actor: unknown) {
  const a = actor as { send: (event: any) => void };

  const fireConfig = tNode.nodeAttributes || {};

  if (!fireConfig.eventType) {
    a.send({ type: 'ERROR', error: 'Missing eventType' });
    return;
  }

  const scope = fireConfig.scope || 'local';
  const eventType = fireConfig.eventType as string;
  // A payload mapping (the editor's, resolved into the TNode's params) wins over the node's payload
  const mapped = tNode.resolvedParams ?? {};
  const payload = 'payload' in mapped ? mapped.payload : resolvePayload((node as FireNode).payload, ctx);
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
