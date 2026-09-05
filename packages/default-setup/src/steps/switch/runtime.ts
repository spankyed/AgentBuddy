import type { SwitchNode, Condition, Predicate, BinaryOperator } from '@/plugins/flows/be/config/types';
import type { ExecutionContext, TNodeEntity } from '@/plugins/brain/be/types';
import { BinaryOperator as Op } from '@abuddy/sdk/utils';
import { brainInspect, brainLogger } from '@/plugins/brain/be/utils/brain-inspect';
import { reportBrainRuntimeError } from '@/plugins/brain/be/runtime-errors';
import { extractValueByPath } from '@/plugins/brain/be/repository/node-attribute-mappers';

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

export async function handler(tNode: unknown, node: unknown, executionContext: unknown, actor: unknown) {
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

export { handler as switchNodeHandler };
