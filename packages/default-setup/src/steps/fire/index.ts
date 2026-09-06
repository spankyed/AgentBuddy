import type { StepDefinition, StepCompileResult, StepCompileContext, StepValidationError, StepValidationContext, StepDecompileContext, ExecutionContext, TNodeEntity } from '@abuddy/sdk/steps';
import { EARS } from '@abuddy/sdk';
import { sendToBrainSystem } from '@abuddy/sdk/services';
import { Zap } from 'lucide-vue-next';
function compile(
  node: Record<string, unknown>,
  nodeId: string,
  ts: number,
  _ctx: StepCompileContext,
): StepCompileResult {
  return {
    entity: {
      id: nodeId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'fire',
      label: (node.label as string) || (node.event as string),
      description: node.description,
      eventType: node.event,
      scope: (node.scope as string) || 'local',
      payload: node.payload,
      final: node.final,
    },
    relations: [],
  };
}

function validate(
  s: Record<string, unknown>,
  path: string,
  _ctx: StepValidationContext,
): StepValidationError[] {
  const errors: StepValidationError[] = [];
  if (!s.event || typeof s.event !== 'string') {
    errors.push({ path, message: 'Fire step must have an "event" string' });
  }
  if (s.scope !== undefined && !['local', 'global'].includes(s.scope as string)) {
    errors.push({ path: `${path}.scope`, message: '"scope" must be "local" or "global"' });
  }
  return errors;
}

function getLabel(step: Record<string, unknown>, index: number): string {
  if (typeof step.label === 'string') return step.label;
  return (step.event as string) || `Fire ${index}`;
}

function handler(tNode: TNodeEntity, _node: unknown, ctx: ExecutionContext, actor: unknown) {
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

function decompile(node: Record<string, unknown>, _ctx: StepDecompileContext): Record<string, unknown> {
  const dsl: Record<string, unknown> = { type: 'fire', event: node.eventType };
  if (node.label && node.label !== node.eventType) dsl.label = node.label;
  if (node.description) dsl.description = node.description;
  if (node.final) dsl.final = true;
  if (node.scope && node.scope !== 'local') dsl.scope = node.scope;
  if (node.payload !== undefined) dsl.payload = node.payload;
  return dsl;
}

export const fireStep: StepDefinition = {
  type: 'fire',
  build: { compile, validate, getLabel, decompile },
  runtime: { handler },
  fe: {
    loadComponents: () => ({ form: require('./form.vue').default }),
    colorKey: 'amber',
    nodeConfig: {
      label: 'Fire',
      defaultLabel: 'Fire event',
      icon: Zap,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      hoverBgColor: 'group-hover:bg-amber-500/15',
      connectionRules: { inputs: 1, outputs: 0 },
      component: 'FireNode',
      category: 'action',
      isImplemented: true,
    },
    defaults: { scope: 'local' },
    layout: {
      getPorts: (node) => [
        { id: `${node.id}-in`, layoutOptions: { 'port.side': 'WEST' } },
      ],
      hasInput: true,
    },
  },
};
