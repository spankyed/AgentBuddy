import type { ExecutionContext, TNodeEntity } from '@abuddy/sdk/steps';
import { reportError, createLogger } from '@abuddy/sdk/logger';
import { services } from '@/__generated__/services';
import type { TransformNode, TransformOutputType } from './types';
import { errorMessage } from '@abuddy/sdk/utils/pure';

const brainLogger = createLogger('brain', { debug: true });

/** The script's return value as the step's result, per the node's `outputType` */
function toOutput(value: unknown, outputType: TransformOutputType): unknown {
  switch (outputType) {
    case 'text':
      return String(value);
    case 'custom':
      return value;
    case 'json': {
      let json: string | undefined;
      try {
        json = JSON.stringify(value);
      } catch (error) {
        throw new Error(`the script's return value isn't JSON-serializable (${errorMessage(error)}); use outputType "custom" to keep it as returned`);
      }
      if (json === undefined) {
        throw new Error(`the script returned ${typeof value === 'undefined' ? 'undefined' : `a ${typeof value}`}, which isn't JSON-serializable; return a JSON value or use outputType "custom"`);
      }
      return JSON.parse(json);
    }
  }
}

export async function handler(t: TNodeEntity, node: unknown, ctx: ExecutionContext, actor: unknown) {
  const n = node as TransformNode;
  const a = actor as { send: (event: { type: string; result?: unknown; error?: unknown }) => void };

  try {
    if (typeof n.script !== 'string' || !n.script.trim()) {
      throw new Error(`Transform step "${n.label}" has no script`);
    }
    const outputType = n.outputType ?? 'json';
    const params: Record<string, unknown> = {
      input: ctx.lastStep?.result,
      ...t.resolvedParams,
    };

    brainLogger.debug(`Executing transform node: ${n.label}`, { outputType, paramKeys: Object.keys(params) });

    let value: unknown;
    try {
      value = await services.action.executeAction(n.script, params, { label: n.label });
    } catch (error) {
      // The script's own error, not the action service's wrapper around it
      const cause = error instanceof Error && error.cause !== undefined ? error.cause : error;
      throw new Error(`Transform step "${n.label}" script failed: ${errorMessage(cause)}`);
    }

    let output: unknown;
    try {
      output = toOutput(value, outputType);
    } catch (error) {
      throw new Error(`Transform step "${n.label}": ${errorMessage(error)}`);
    }

    a.send({ type: 'COMPLETE', result: output });
  } catch (error) {
    const runtimeError = reportError({
      error,
      source: 'brain-transform',
      step: {
        phase: 'transform.execute',
        flowTNodeId: ctx.flowTNodeId,
        tNodeId: t.id,
        nodeId: n.id,
        nodeLabel: n.label,
        nodeType: n.nodeType,
        eventType: ctx.event?.type,
      },
    });
    a.send({ type: 'ERROR', error: runtimeError });
  }
}
