import type { StepDefinition, StepCompileResult, StepCompileContext, StepValidationError, StepValidationContext, StepDecompileContext } from '@abuddy/sdk/steps';
import type { ExecutionContext, TNodeEntity } from '@/plugins/brain/be/types';
import type { NodeEntity } from '@/plugins/flows/be/config/types';
import { EARS } from '@/registries/ears';
import { expandFieldMappings, collapseFieldMappings } from '../shared';
import { repository } from '@abuddy/sdk/ears';
import { z } from 'zod';
import { brainInspect } from '@/plugins/brain/be/utils/brain-inspect';
import { reportBrainRuntimeError } from '@/plugins/brain/be/runtime-errors';

/* ── Build facet ─────────────────────────────────────────────────────── */

function compile(
  node: Record<string, unknown>,
  nodeId: string,
  ts: number,
  ctx: StepCompileContext,
): StepCompileResult {
  const actionId = ctx.actions.get(node.action as string);
  return {
    entity: {
      id: nodeId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'action',
      label: (node.label as string) || (node.action as string),
      description: node.description,
      actionId,
      params: node.params,
      fieldMappings: expandFieldMappings(node.map as Record<string, string> | undefined),
      final: node.final,
    },
    relations: actionId ? [
      { source: nodeId, kind: EARS.RelKind.INSTANCE_OF as string, target: actionId }
    ] : [],
  };
}

function validate(
  s: Record<string, unknown>,
  path: string,
  ctx: StepValidationContext,
): StepValidationError[] {
  const errors: StepValidationError[] = [];
  if (!s.action || typeof s.action !== 'string') {
    errors.push({ path, message: 'Action step must have an "action" string (action name)' });
  } else if (!ctx.skipReferenceCheck && !ctx.actions.has(s.action)) {
    errors.push({
      path: `${path}.action`,
      message: `Action "${s.action}" not found. Available: ${Array.from(ctx.actions).join(', ') || '(none)'}`,
    });
  }
  if (s.map !== undefined && (typeof s.map !== 'object' || s.map === null || Array.isArray(s.map))) {
    errors.push({ path: `${path}.map`, message: '"map" must be an object { target: source }' });
  }
  return errors;
}

function getLabel(step: Record<string, unknown>, index: number): string {
  if (typeof step.label === 'string') return step.label;
  return (step.action as string) || `Action ${index}`;
}

/* ── Runtime facet ───────────────────────────────────────────────────── */

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

async function handler(tNode: unknown, node: unknown, executionContext: unknown, actor: unknown) {
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

function decompile(node: Record<string, unknown>, ctx: StepDecompileContext): Record<string, unknown> {
  const actionLabel = node.actionId
    ? ctx.actionMap.get(node.actionId as string) || node.actionId
    : node.label || 'Unknown Action';
  const dsl: Record<string, unknown> = { type: 'action', action: actionLabel };
  if (node.label && node.label !== actionLabel) dsl.label = node.label;
  if (node.description) dsl.description = node.description;
  if (node.final) dsl.final = true;
  const map = collapseFieldMappings(node.fieldMappings as any);
  if (map) dsl.map = map;
  if (node.params && Object.keys(node.params as any).length > 0) dsl.params = node.params;
  return dsl;
}

export const actionStep: StepDefinition = {
  type: 'action',
  build: { compile, validate, getLabel, decompile, relation: { field: 'actionId', targetEntity: 'Action' } },
  runtime: { handler, isAsync: true },
  fe: {
    colorKey: 'neutral',
    nodeConfig: {
      label: 'Action',
      defaultLabel: 'Do action',
      icon: 'Play',
      color: 'text-neutral-400',
      bgColor: 'bg-neutral-700/20',
      hoverBgColor: 'group-hover:bg-neutral-700/30',
      connectionRules: { inputs: -1, outputs: -1 },
      component: 'ActionNode',
      category: 'action',
      isImplemented: true,
    },
  },
};
