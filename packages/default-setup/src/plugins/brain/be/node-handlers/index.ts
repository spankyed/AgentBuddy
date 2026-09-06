import type { NodeEntity } from '@/plugins/flows/be/config/types';
import type { ExecutionContext, TNodeEntity } from '../types';
import { stepRegistry } from '@abuddy/sdk/steps';
import { createLogger } from '@abuddy/sdk/logger';
import { reportBrainRuntimeError } from '../runtime-errors';

const logger = createLogger('node-executor');

export function executeNode(
  tNode: TNodeEntity,
  node: NodeEntity,
  executionContext: ExecutionContext,
  actor: any
) {
  if (stepRegistry.isTrigger(node.nodeType)) {
    logger.warn(`Trigger node "${node.label}" executed as step — this shouldn't happen`);
    setTimeout(() => {
      try { actor.send({ type: 'COMPLETE', result: { executed: true } }); } catch { /* actor gone */ }
    }, 100);
    return;
  }

  const stepDef = stepRegistry.get(node.nodeType);
  if (!stepDef?.runtime?.handler) {
    logger.warn(`No runtime handler for node type: ${node.nodeType}`);
    setTimeout(() => {
      try { actor.send({ type: 'COMPLETE', result: { executed: true } }); } catch { /* actor gone */ }
    }, 100);
    return;
  }

  const { handler, isAsync } = stepDef.runtime;

  if (isAsync) {
    const promise = handler(tNode, node, executionContext, actor) as Promise<void>;
    promise.catch((err) => {
      const runtimeError = reportBrainRuntimeError({
        error: err,
        source: `brain-${node.nodeType}`,
        phase: `${node.nodeType}.handler`,
        flowTNodeId: executionContext.flowTNodeId,
        tNodeId: tNode.id,
        nodeId: node.id,
        nodeLabel: node.label,
        nodeType: node.nodeType,
        eventType: executionContext.event?.type,
      });
      try { actor.send({ type: 'ERROR', error: runtimeError }); } catch { /* actor gone */ }
    });
  } else {
    handler(tNode, node, executionContext, actor);
  }
} 
