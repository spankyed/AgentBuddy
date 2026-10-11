import type { NodeEntity } from '#generated/types.ts';
import type { ExecutionContext, TNodeEntity } from '@apack/sdk/steps';
import { stepRegistry } from '@apack/sdk/steps';
import { createLogger, reportError } from '@apack/sdk/logger';

const logger = createLogger('node-executor');

/** Completes a step with nothing to run, after the spawn that runs it finishes */
function completeLater(actor: { send(event: { type: string; result?: unknown }): void }): void {
  queueMicrotask(() => {
    try { actor.send({ type: 'COMPLETE', result: { executed: true } }); } catch { /* actor gone */ }
  });
}

export function executeNode(
  tNode: TNodeEntity,
  node: NodeEntity,
  executionContext: ExecutionContext,
  actor: any
) {
  if (stepRegistry.isTrigger(node.nodeType)) {
    logger.warn(`Trigger node "${node.label}" executed as step — this shouldn't happen`);
    completeLater(actor);
    return;
  }

  const stepDef = stepRegistry.get(node.nodeType);
  if (!stepDef?.runtime?.handler) {
    logger.warn(`No runtime handler for node type: ${node.nodeType}`);
    completeLater(actor);
    return;
  }

  const { handler, isAsync } = stepDef.runtime;

  if (isAsync) {
    const promise = handler(tNode, node, executionContext, actor) as Promise<void>;
    promise.catch((err) => {
      const runtimeError = reportError({
        error: err,
        source: `brain-${node.nodeType}`,
        step: {
          phase: `${node.nodeType}.handler`,
          flowTNodeId: executionContext.flowTNodeId,
          tNodeId: tNode.id,
          nodeId: node.id,
          nodeLabel: node.label,
          nodeType: node.nodeType,
          eventType: executionContext.event?.type,
        },
      });
      try { actor.send({ type: 'ERROR', error: runtimeError }); } catch { /* actor gone */ }
    });
  } else {
    handler(tNode, node, executionContext, actor);
  }
} 
