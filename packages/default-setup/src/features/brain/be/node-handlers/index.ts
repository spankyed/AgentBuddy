import type { NodeEntity } from '#generated/types.ts';
import type { ExecutionContext, TNodeEntity } from '@apackdev/sdk/steps';
import { getStepBinding, stepRegistry } from '@apackdev/sdk/steps';
import { createLogger, reportError } from '@apackdev/sdk/logger';

const logger = createLogger('node-executor');

/** Completes a step with nothing to run, after the spawn that runs it finishes */
function completeLater(actor: { send(event: { type: string; result?: unknown }): void }): void {
  queueMicrotask(() => {
    try { actor.send({ type: 'COMPLETE', result: { executed: true } }); } catch { /* actor gone */ }
  });
}

/** Records a step's error on its TNode and fails it, after the spawn that runs it finishes */
function failLater(actor: { send(event: { type: string; error?: unknown }): void }, report: () => unknown): void {
  queueMicrotask(() => {
    const error = report();
    try { actor.send({ type: 'ERROR', error }); } catch { /* actor gone */ }
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

  const step = (phase: string) => ({
    phase,
    flowTNodeId: executionContext.flowTNodeId,
    tNodeId: tNode.id,
    nodeId: node.id,
    nodeLabel: node.label,
    nodeType: node.nodeType,
    eventType: executionContext.event?.type,
  });

  const accepted = getStepBinding(node.nodeType);
  const stepDef = accepted?.binding;
  if (!accepted || !stepDef?.runtime?.handler) {
    // A step with nothing to run fails rather than passing: the flow would otherwise carry on as if it had worked
    failLater(actor, () => reportError({
      error: new Error(`No running pack provides step type "${node.nodeType}"; enable or install the pack that does, or wait for it to finish reloading`),
      source: `brain-${node.nodeType}`,
      step: step(`${node.nodeType}.handler`),
    }));
    return;
  }

  const { handler, isAsync } = stepDef.runtime;
  const context: ExecutionContext = { ...executionContext,
    runtime: { ...executionContext.runtime, servicesForAction: accepted.servicesForAction },
  };

  if (isAsync) {
    const promise = handler(tNode, node, context, actor) as Promise<void>;
    promise.catch((err) => {
      const runtimeError = reportError({
        error: err,
        source: `brain-${node.nodeType}`,
        step: step(`${node.nodeType}.handler`),
      });
      try { actor.send({ type: 'ERROR', error: runtimeError }); } catch { /* actor gone */ }
    });
  } else {
    handler(tNode, node, context, actor);
  }
} 
