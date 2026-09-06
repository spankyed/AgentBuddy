import type { StepDefinition, StepCompileResult, StepCompileContext, StepValidationError, StepValidationContext, StepDecompileContext } from '@abuddy/sdk/steps';
import { EARS } from '@abuddy/sdk';
import { expandRecord, collapseRecord } from '@abuddy/sdk/steps';
import { Workflow } from 'lucide-vue-next';

function compile(
  node: Record<string, unknown>,
  nodeId: string,
  ts: number,
  ctx: StepCompileContext,
): StepCompileResult {
  const flowRef = ctx.flows.get(node.flow as string) || (node.flow as string);
  return {
    entity: {
      id: nodeId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'flow',
      label: (node.label as string) || (node.flow as string),
      description: node.description,
      flowRef,
      propagateCtx: node.inherit !== false,
      fieldMappings: expandRecord(node.map as Record<string, string> | undefined),
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
  if (!s.flow || typeof s.flow !== 'string') {
    errors.push({ path, message: 'Flow step must have a "flow" string (sub-flow name)' });
  }
  return errors;
}

function getLabel(step: Record<string, unknown>, index: number): string {
  if (typeof step.label === 'string') return step.label;
  return (step.flow as string) || `Flow ${index}`;
}

function decompile(node: Record<string, unknown>, ctx: StepDecompileContext): Record<string, unknown> {
  const flowLabel = ctx.flowMap.get(node.flowRef as string) || node.flowRef;
  const dsl: Record<string, unknown> = { type: 'flow', flow: flowLabel };
  if (node.label && node.label !== flowLabel) dsl.label = node.label;
  if (node.description) dsl.description = node.description;
  if (node.final) dsl.final = true;
  if (node.propagateCtx === false) dsl.inherit = false;
  const map = collapseRecord(node.fieldMappings as any);
  if (map) dsl.map = map;
  return dsl;
}

export const flowStep: StepDefinition = {
  type: 'flow',
  build: { compile, validate, getLabel, decompile },
  runtime: { spawnsSubflow: true },
  fe: {
    loadComponents: () => ({ form: require('./form.vue').default }),
    colorKey: 'purple',
    nodeConfig: {
      label: 'Flow',
      defaultLabel: 'Handle flow',
      icon: Workflow,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      hoverBgColor: 'group-hover:bg-purple-500/15',
      connectionRules: { inputs: 1, outputs: 1 },
      component: 'VariableNode',
      category: 'logic',
      isImplemented: true,
    },
    defaults: { propagateCtx: true },
  },
};
