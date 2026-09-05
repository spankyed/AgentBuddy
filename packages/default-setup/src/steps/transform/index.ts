import type { StepDefinition, StepCompileResult, StepValidationError, StepValidationContext, StepCompileContext, StepDecompileContext } from '@abuddy/sdk/steps';
import { EARS } from '@/registries/ears';

function compile(node: Record<string, unknown>, nodeId: string, ts: number, _ctx: StepCompileContext): StepCompileResult {
  return {
    entity: {
      id: nodeId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'transform',
      label: (node.label as string) || 'Transform',
      description: node.description,
      script: node.script,
      outputType: (node.outputType as string) || 'json',
      final: node.final,
    },
    relations: [],
  };
}

function validate(s: Record<string, unknown>, path: string, _ctx: StepValidationContext): StepValidationError[] {
  const errors: StepValidationError[] = [];
  if (!s.script || typeof s.script !== 'string') {
    errors.push({ path, message: 'Transform step must have a "script" string' });
  }
  if (s.outputType !== undefined && !['json', 'text', 'custom'].includes(s.outputType as string)) {
    errors.push({ path: `${path}.outputType`, message: '"outputType" must be "json", "text", or "custom"' });
  }
  return errors;
}

function getLabel(step: Record<string, unknown>, index: number): string {
  if (typeof step.label === 'string') return step.label;
  return `Transform ${index}`;
}

function decompile(node: Record<string, unknown>, _ctx: StepDecompileContext): Record<string, unknown> {
  const dsl: Record<string, unknown> = { type: 'transform', script: node.script };
  if (node.label) dsl.label = node.label;
  if (node.description) dsl.description = node.description;
  if (node.final) dsl.final = true;
  if (node.outputType && node.outputType !== 'json') dsl.outputType = node.outputType;
  return dsl;
}

export const transformStep: StepDefinition = {
  type: 'transform',
  build: { compile, validate, getLabel, decompile },
  fe: {
    colorKey: 'emerald',
    nodeConfig: {
      label: 'Transform',
      defaultLabel: 'Transform output',
      icon: 'Shuffle',
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      hoverBgColor: 'group-hover:bg-emerald-500/15',
      connectionRules: { inputs: 1, outputs: 1 },
      component: 'VariableNode',
      category: 'data',
      isImplemented: false,
    },
    defaults: { outputType: 'json' },
  },
};
