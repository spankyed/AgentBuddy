import type { ExecutionContext, TNodeEntity } from '@abuddy/sdk/steps';
import type { EARS } from '@abuddy/sdk';
import type { NodeEntity } from '@/__generated__/types';
import { repository } from '@/__generated__/repository';
import { createLogger, reportError } from '@abuddy/sdk/logger';
import { runActionCode } from './sandbox';

const brainLogger = createLogger('brain', { debug: true });

interface ActionNodeConfig {
  mode?: 'template' | 'code';
  actionFn?: string;
  params?: Record<string, any>;
  fieldMappings?: Array<{ target: string; source: string; default?: any }>;
}

type ActionNode = NodeEntity & ActionNodeConfig;

export async function handler(t: TNodeEntity, node: unknown, ctx: ExecutionContext, actor: unknown) {
  const n = node as ActionNode;
  const a = actor as { send: (event: any) => void };
  const nodeData = t.nodeAttributes || {};

  let actionId: string | undefined;
  let actionLabel: string | undefined;

  try {
    brainLogger.debug(`Executing action node: ${n.label}`, {
      tNode: t,
      node: n,
      nodeAttributeKeys: Object.keys(nodeData),
    });

    if (n.mode === 'code' && n.actionFn) {
      const params: Record<string, any> = {
        event: ctx.event,
        steps: ctx.steps,
        lastStep: ctx.lastStep,
      };

      brainLogger.debug(`Executing inline action code for: ${n.label}`, params);

      const result = await runActionCode(n.actionFn, {
        label: n.label,
        params,
        services: ctx.runtime.getAppServices() as object,
        flowId: ctx.flowTNodeId,
      });

      brainLogger.debug(`Inline action completed successfully:`, { nodeLabel: n.label, result });
      a.send({ type: 'COMPLETE', result });
      return;
    }

    actionId = repository.flowsQueries.getNodeActionId(n.id);

    if (!actionId) {
      throw new Error('No action linked to this node');
    }

    const action = repository.actionQueries.byId(actionId as EARS.EntityId);
    if (!action) {
      throw new Error(`Action not found: ${actionId}`);
    }
    actionLabel = action.label;

    brainLogger.debug(`Found action: ${action.label}`, {
      input: Object.keys(action.input || {}),
    });

    const params: Record<string, any> = (t.resolvedParams as Record<string, any>) || {};

    brainLogger.debug(`Executing action with resolved params:`, params);

    const result = await runActionCode(action.actionFn, {
      label: action.label,
      params,
      services: ctx.runtime.getAppServices() as object,
      flowId: ctx.flowTNodeId,
    });

    brainLogger.debug(`Action completed successfully:`, {
      nodeLabel: n.label,
      actionLabel: action.label,
      result,
    });

    a.send({ type: 'COMPLETE', result });

  } catch (error) {
    const runtimeError = reportError({
      error,
      source: 'brain-action',
      step: {
        phase: 'action.execute',
        flowTNodeId: ctx.flowTNodeId,
        tNodeId: t.id,
        nodeId: n.id,
        nodeLabel: n.label,
        nodeType: n.nodeType,
        actionId: actionId as any,
        actionLabel,
        eventType: ctx.event?.type,
      },
    });

    a.send({ type: 'ERROR', error: runtimeError });
  }
}
