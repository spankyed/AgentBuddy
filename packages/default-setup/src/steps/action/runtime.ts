import type { ExecutionContext, TNodeEntity } from '@/plugins/brain/be/types';
import type { NodeEntity } from '@/plugins/flows/be/config/types';
import { repository } from '@abuddy/sdk/ears';
import { z } from 'zod';
import { brainInspect } from '@/plugins/brain/be/utils/brain-inspect';
import { reportBrainRuntimeError } from '@/plugins/brain/be/runtime-errors';

interface ActionNodeConfig {
  mode?: 'template' | 'code';
  actionFn?: string;
  params?: Record<string, any>;
  fieldMappings?: Array<{ target: string; source: string; default?: any }>;
}

type ActionNode = NodeEntity & ActionNodeConfig;

async function executeActionFunction(
  actionFn: string,
  params: Record<string, any>,
  flowTNodeId: string,
  services: any,
): Promise<any> {
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const func = new AsyncFunction('params', 'services', 'z', 'flowId', actionFn);
  return func(params, services, z, flowTNodeId);
}

export async function handler(tNode: unknown, node: unknown, executionContext: unknown, actor: unknown) {
  const t = tNode as TNodeEntity;
  const n = node as ActionNode;
  const ctx = executionContext as ExecutionContext;
  const a = actor as { send: (event: any) => void };
  const nodeData = t.nodeAttributes || {};

  let actionId: string | undefined;
  let actionLabel: string | undefined;

  try {
    brainInspect(`Executing action node: ${n.label}`, {
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

      brainInspect(`Executing inline action code for: ${n.label}`, params);

      const result = await executeActionFunction(
        n.actionFn,
        params,
        ctx.flowTNodeId,
        ctx.runtime.getAppServices(),
      );

      brainInspect(`Inline action completed successfully:`, { nodeLabel: n.label, result });
      a.send({ type: 'COMPLETE', result });
      return;
    }

    actionId = repository.flowsQueries.getNodeActionId(n.id);

    if (!actionId) {
      throw new Error('No action linked to this node');
    }

    const action = repository.actionQueries.byId(actionId);
    if (!action) {
      throw new Error(`Action not found: ${actionId}`);
    }
    actionLabel = action.label;

    brainInspect(`Found action: ${action.label}`, {
      input: Object.keys(action.input || {}),
    });

    const params: Record<string, any> = (t.resolvedParams as Record<string, any>) || {};

    brainInspect(`Executing action with resolved params:`, params);

    const result = await executeActionFunction(
      action.actionFn,
      params,
      ctx.flowTNodeId,
      ctx.runtime.getAppServices(),
    );

    brainInspect(`Action completed successfully:`, {
      nodeLabel: n.label,
      actionLabel: action.label,
      result,
    });

    a.send({ type: 'COMPLETE', result });

  } catch (error) {
    const runtimeError = reportBrainRuntimeError({
      error,
      source: 'brain-action',
      phase: 'action.execute',
      flowTNodeId: ctx.flowTNodeId,
      tNodeId: t.id,
      nodeId: n.id,
      nodeLabel: n.label,
      nodeType: n.nodeType,
      actionId: actionId as any,
      actionLabel,
      eventType: ctx.event?.type,
    });

    a.send({ type: 'ERROR', error: runtimeError });
  }
}
