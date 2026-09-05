import type { StepDefinition, StepCompileResult, StepValidationError, StepValidationContext, StepCompileContext, StepDecompileContext } from '@abuddy/sdk/steps';
import type { SwitchNode, Condition, Predicate, BinaryOperator } from '@/plugins/flows/be/config/types';
import type { ExecutionContext, TNodeEntity } from '@/plugins/brain/be/types';
import { BinaryOperator as Op } from '@abuddy/sdk/utils';
import { EARS } from '@/registries/ears';
import { brainInspect, brainLogger } from '@/plugins/brain/be/utils/brain-inspect';
import { reportBrainRuntimeError } from '@/plugins/brain/be/runtime-errors';
import { extractValueByPath } from '@/plugins/brain/be/repository/node-attribute-mappers';

/* ── Build facet ─────────────────────────────────────────────────────── */

function parseExpressionToPredicate(expr: string): { key: string; operator: BinaryOperator; value?: any } | undefined {
  if (!expr || expr.trim() === '') return undefined;
  const trimmed = expr.trim();

  const operatorMap: Record<string, BinaryOperator> = {
    '===': Op.EQUALS,
    '!==': Op.NOT_EQUALS,
    '==': Op.EQUALS,
    '!=': Op.NOT_EQUALS,
    '>=': Op.GREATER_THAN_OR_EQUALS,
    '<=': Op.LESS_THAN_OR_EQUALS,
    '>': Op.GREATER_THAN,
    '<': Op.LESS_THAN,
    'contains': Op.CONTAINS,
    'starts_with': Op.STARTS_WITH,
    'ends_with': Op.ENDS_WITH,
    'matches': Op.MATCHES,
    'is_empty': Op.IS_EMPTY,
    'is_null': Op.IS_NULL,
  };

  const operatorPatterns = ['===', '!==', '>=', '<=', '!=', '==', '>', '<', 'contains', 'starts_with', 'ends_with', 'matches', 'is_empty', 'is_null'];

  for (const op of operatorPatterns) {
    const regex = new RegExp(`^(.+?)\\s*${op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(.*)$`, 'i');
    const match = trimmed.match(regex);

    if (match) {
      const [, key, value] = match;
      const mappedOperator = operatorMap[op.toLowerCase()] as BinaryOperator;

      if (op === 'is_empty' || op === 'is_null') {
        return { key: key.trim(), operator: mappedOperator };
      }

      let parsedValue: any = value.trim();
      if (!parsedValue.startsWith('$.')) {
        if (parsedValue === 'true') parsedValue = true;
        else if (parsedValue === 'false') parsedValue = false;
        else if (!isNaN(Number(parsedValue)) && parsedValue !== '') parsedValue = Number(parsedValue);
        else if ((parsedValue.startsWith("'") && parsedValue.endsWith("'")) ||
                 (parsedValue.startsWith('"') && parsedValue.endsWith('"'))) {
          parsedValue = parsedValue.slice(1, -1);
        }
      }

      return { key: key.trim(), operator: mappedOperator, value: parsedValue };
    }
  }

  return { key: trimmed, operator: Op.EQUALS as BinaryOperator, value: true };
}

function compile(node: Record<string, unknown>, nodeId: string, ts: number, _ctx: StepCompileContext): StepCompileResult {
  const conditions = (node.conditions as any[]).map((c: any, ci: number) => ({
    predicate: parseExpressionToPredicate(c.if),
    label: c.steps?.length > 0 ? (c.steps[0].label || c.steps[0].type || `branch-${ci}`) : `branch-${ci}`,
  }));

  if (Array.isArray(node.else) && (node.else as any[]).length > 0) {
    const elseSteps = node.else as any[];
    conditions.push({
      predicate: undefined,
      label: elseSteps[0].label || elseSteps[0].type || `else`,
    });
  }

  return {
    entity: {
      id: nodeId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'switch',
      label: (node.label as string) || 'Switch',
      description: node.description,
      conditions,
      final: node.final,
    },
    relations: [],
  };
}

function validate(s: Record<string, unknown>, path: string, _ctx: StepValidationContext): StepValidationError[] {
  const errors: StepValidationError[] = [];
  if (!Array.isArray(s.conditions)) {
    errors.push({ path, message: 'Switch step must have a "conditions" array' });
    return errors;
  }
  if ((s.conditions as any[]).length === 0) {
    errors.push({ path: `${path}.conditions`, message: 'Switch must have at least one condition' });
  }
  for (let i = 0; i < (s.conditions as any[]).length; i++) {
    const cond = (s.conditions as any[])[i] as Record<string, unknown>;
    const condPath = `${path}.conditions[${i}]`;
    if (!cond.if || typeof cond.if !== 'string') {
      errors.push({ path: condPath, message: 'Condition must have an "if" expression string' });
    }
    if (!Array.isArray(cond.steps)) {
      errors.push({ path: `${condPath}.steps`, message: 'Condition must have a "steps" array' });
    }
  }
  if (s.else !== undefined && !Array.isArray(s.else)) {
    errors.push({ path: `${path}.else`, message: '"else" must be an array of steps' });
  }
  return errors;
}

function getLabel(step: Record<string, unknown>, index: number): string {
  if (typeof step.label === 'string') return step.label;
  return `Switch ${index}`;
}

/* ── Runtime facet ───────────────────────────────────────────────────── */

function resolveValue(key: string, context: ExecutionContext): any {
  if (!key) return undefined;

  if (key.startsWith('$.')) {
    return extractValueByPath(context, key);
  }

  if (context.lastStep?.result && typeof context.lastStep.result === 'object') {
    return (context.lastStep.result as Record<string, any>)[key];
  }

  return undefined;
}

function isEmpty(value: any): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function evaluateOperator(operator: BinaryOperator, actual: any, expected: any): boolean {
  switch (operator) {
    case Op.EQUALS:
      return actual == expected;

    case Op.NOT_EQUALS:
      return actual != expected;

    case Op.GREATER_THAN:
    case Op.LESS_THAN:
    case Op.GREATER_THAN_OR_EQUALS:
    case Op.LESS_THAN_OR_EQUALS: {
      const numActual = Number(actual);
      const numExpected = Number(expected);
      if (isNaN(numActual) || isNaN(numExpected)) {
        brainLogger.warn(`Numeric comparison with NaN: operator=${operator}, actual=${actual}, expected=${expected}`);
      }
      if (operator === Op.GREATER_THAN) return numActual > numExpected;
      if (operator === Op.LESS_THAN) return numActual < numExpected;
      if (operator === Op.GREATER_THAN_OR_EQUALS) return numActual >= numExpected;
      return numActual <= numExpected;
    }

    case Op.CONTAINS:
      return String(actual).includes(String(expected));

    case Op.STARTS_WITH:
      return String(actual).startsWith(String(expected));

    case Op.ENDS_WITH:
      return String(actual).endsWith(String(expected));

    case Op.MATCHES:
      try {
        const pattern = String(expected);
        if (pattern.length > 500) {
          brainLogger.warn(`Regex pattern too long (${pattern.length} chars), rejecting`);
          return false;
        }
        return new RegExp(pattern).test(String(actual));
      } catch {
        brainLogger.warn(`Invalid regex pattern: ${expected}`);
        return false;
      }

    case Op.IS_EMPTY:
      return isEmpty(actual);

    case Op.IS_NULL:
      return actual === null || actual === undefined;

    default:
      brainLogger.warn(`Unknown operator: ${operator}`);
      return false;
  }
}

function evaluatePredicate(predicate: Predicate | undefined, context: ExecutionContext): boolean {
  if (!predicate) return true;

  if (typeof predicate === 'function') {
    try {
      return Boolean(predicate(context));
    } catch (error) {
      brainLogger.error('Predicate function threw error:', { error });
      return false;
    }
  }

  const { key, operator, value } = predicate;
  const actualValue = resolveValue(key, context);
  const expectedValue = (typeof value === 'string' && value.startsWith('$.'))
    ? extractValueByPath(context, value)
    : value;

  brainInspect(`Evaluating predicate:`, {
    key,
    operator,
    expectedValue: value,
    resolvedExpectedValue: expectedValue,
    actualValue,
  });

  return evaluateOperator(operator, actualValue, expectedValue);
}

function evaluateCodePredicate(condition: Condition, context: ExecutionContext): boolean {
  if (!condition.code) return false;

  try {
    const predObj = condition.predicate && typeof condition.predicate !== 'function'
      ? condition.predicate
      : null;

    let params: Record<string, any>;
    if (predObj?.key) {
      params = { value: resolveValue(predObj.key, context) };
    } else {
      params = {
        event: context.event,
        steps: context.steps,
        lastStep: context.lastStep,
      };
    }

    const fn = new Function('params', condition.code);
    const result = Boolean(fn(params));

    brainInspect(`Code predicate evaluated:`, {
      label: condition.label,
      hasKey: !!predObj?.key,
      result,
    });

    return result;
  } catch (error) {
    brainLogger.error('Code predicate evaluation failed:', { error, label: condition.label });
    return false;
  }
}

function evaluateConditions(conditions: Condition[], context: ExecutionContext): number {
  for (let i = 0; i < conditions.length; i++) {
    const condition = conditions[i];
    const matches = condition.mode === 'code'
      ? evaluateCodePredicate(condition, context)
      : evaluatePredicate(condition.predicate, context);

    brainInspect(`Condition ${i} (${condition.label || 'unlabeled'}): ${matches ? 'MATCHED' : 'no match'}`);

    if (matches) {
      return i;
    }
  }

  return -1;
}

function handler(tNode: unknown, node: unknown, executionContext: unknown, actor: unknown) {
  const t = tNode as TNodeEntity;
  const n = node as SwitchNode;
  const ctx = executionContext as ExecutionContext;
  const a = actor as { send: (event: any) => void };

  try {
    const conditions = n.conditions || [];

    brainInspect(`Executing switch node: ${n.label}`, {
      conditionsCount: conditions.length,
      conditions: Array.isArray(conditions) ? conditions.map((c, i) => ({
        index: i,
        label: c.label,
        hasPredicate: !!c.predicate,
      })) : [],
    });

    if (conditions.length === 0) {
      const runtimeError = reportBrainRuntimeError({
        error: new Error('Switch node has no conditions to evaluate'),
        source: 'brain-switch',
        phase: 'switch.validate',
        flowTNodeId: ctx.flowTNodeId,
        tNodeId: t.id,
        nodeId: n.id,
        nodeLabel: n.label,
        nodeType: n.nodeType,
        eventType: ctx.event?.type,
      });
      a.send({ type: 'ERROR', error: runtimeError });
      return;
    }

    const branchIndex = evaluateConditions(conditions, ctx);

    if (branchIndex === -1) {
      brainInspect(`Switch node '${n.label}': no condition matched, ending chain`);
      a.send({
        type: 'COMPLETE',
        result: {
          nodeType: 'switch',
          branchIndex: -1,
          sourceHandle: undefined,
          noMatch: true,
        },
      });
      return;
    }

    const matchedCondition = conditions[branchIndex];

    brainInspect(`Switch node resolved to branch ${branchIndex}`, {
      branchLabel: matchedCondition?.label,
      sourceHandle: `branch-${branchIndex}`,
    });

    a.send({
      type: 'COMPLETE',
      result: {
        nodeType: 'switch',
        branchIndex,
        branchLabel: matchedCondition?.label,
        sourceHandle: `branch-${branchIndex}`,
      },
    });
  } catch (error) {
    const runtimeError = reportBrainRuntimeError({
      error,
      source: 'brain-switch',
      phase: 'switch.evaluate',
      flowTNodeId: ctx.flowTNodeId,
      tNodeId: t.id,
      nodeId: n.id,
      nodeLabel: n.label,
      nodeType: n.nodeType,
      eventType: ctx.event?.type,
    });

    a.send({ type: 'ERROR', error: runtimeError });
  }
}

const operatorToDsl: Record<string, string> = {
  equals: '==', not_equals: '!=', greater_than: '>', less_than: '<',
  greater_than_or_equals: '>=', less_than_or_equals: '<=',
  contains: 'contains', starts_with: 'starts_with', ends_with: 'ends_with',
  matches: 'matches', is_empty: 'is_empty', is_null: 'is_null',
};

function decompile(node: Record<string, unknown>, ctx: StepDecompileContext): Record<string, unknown> {
  const conditions = (Array.isArray(node.conditions) ? node.conditions : []) as Array<{
    predicate?: { key: string; operator: string; value?: unknown } | Function;
    label?: string;
  }>;

  const validConditions = conditions.filter(c => {
    if (!c.predicate || typeof c.predicate === 'function') return !!c.predicate;
    return c.predicate.key && c.predicate.key.trim() !== '';
  });

  const dsl: Record<string, unknown> = {
    type: 'switch',
    conditions: validConditions.map(c => {
      let ifExpr = '';
      if (c.predicate && typeof c.predicate !== 'function') {
        const opSymbol = operatorToDsl[c.predicate.operator] || c.predicate.operator;
        if (c.predicate.operator === 'is_empty' || c.predicate.operator === 'is_null') {
          ifExpr = `${c.predicate.key} ${opSymbol}`;
        } else {
          ifExpr = `${c.predicate.key} ${opSymbol} ${c.predicate.value ?? ''}`;
        }
      } else if (typeof c.predicate === 'function') {
        ifExpr = '[custom function]';
      }

      const origIdx = conditions.indexOf(c);
      const branchSteps = ctx.resolveBranch?.(node.id as string, `branch-${origIdx}`);
      return { if: ifExpr, steps: branchSteps || [] };
    }),
  };

  if (node.label) dsl.label = node.label;
  if (node.description) dsl.description = node.description;
  if (node.final) dsl.final = true;

  const elseSteps = ctx.resolveBranch?.(node.id as string, `branch-${validConditions.length}`);
  if (elseSteps && elseSteps.length > 0) dsl.else = elseSteps;

  return dsl;
}

const SWITCH_DIMS = { rowHeight: 26, headerOffset: 43, bottomPadding: 10 };

export { handler as switchNodeHandler };

export const switchStep: StepDefinition = {
  type: 'switch',
  build: { compile, validate, getLabel, decompile },
  runtime: { handler },
  fe: {
    colorKey: 'yellow',
    nodeConfig: {
      label: 'Switch',
      defaultLabel: 'Choose path',
      icon: 'Split',
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/10',
      hoverBgColor: 'group-hover:bg-yellow-500/15',
      connectionRules: { inputs: 1, outputs: -1 },
      component: 'SwitchNode',
      category: 'logic',
      isImplemented: true,
    },
    defaults: { conditions: [{ predicate: undefined, label: 'Else' }] },
    handlePrefix: 'branch',
    layout: {
      getHeight: (node) => {
        const branchCount = (node.conditions as any[])?.length ?? 0;
        return Math.max(50, SWITCH_DIMS.headerOffset + branchCount * SWITCH_DIMS.rowHeight + SWITCH_DIMS.bottomPadding);
      },
      getPorts: (node) => {
        const branchCount = (node.conditions as any[])?.length ?? 0;
        const ports: Array<{ id: string; layoutOptions: Record<string, string> }> = [
          { id: `${node.id}-in`, layoutOptions: { 'port.side': 'WEST' } },
        ];
        for (let i = 0; i < branchCount; i++) {
          ports.push({
            id: `${node.id}-out-branch-${i}`,
            layoutOptions: { 'port.side': 'EAST', 'port.index': String(i) },
          });
        }
        return ports;
      },
      hasInput: true,
    },
  },
};
