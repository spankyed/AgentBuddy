import type { SwitchNode, Condition, Predicate, BinaryOperator } from '@/core/shared-types/flows';
import { BinaryOperator as Op } from '@/core/helpers/binary-operator';
import type { ExecutionContext, TNodeEntity } from '@/systems/brain/types';
import { brainInspect, brainLogger } from '../utils/brain-inspect';
import { extractValueByPath } from '../repository/node-attribute-mappers';

/**
 * Resolve a value from the execution context using a key path
 */
function resolveValue(key: string, context: ExecutionContext): any {
  if (!key) return undefined;

  // Handle JSONPath-style paths
  if (key.startsWith('$.')) {
    return extractValueByPath(context, key);
  }

  // Handle simple key lookup in lastStep result
  if (context.lastStep?.result && typeof context.lastStep.result === 'object') {
    return (context.lastStep.result as Record<string, any>)[key];
  }

  return undefined;
}

/**
 * Check if a value is empty (null, undefined, empty string, empty array, empty object)
 */
function isEmpty(value: any): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Evaluate a binary operator comparison
 */
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

/**
 * Evaluate a single predicate against the execution context
 */
function evaluatePredicate(predicate: Predicate | undefined, context: ExecutionContext): boolean {
  // No predicate = always true (else/default branch)
  if (!predicate) return true;

  // Function predicate
  if (typeof predicate === 'function') {
    try {
      return Boolean(predicate(context));
    } catch (error) {
      brainLogger.error('Predicate function threw error:', { error });
      return false;
    }
  }

  // Object predicate with key, operator, value
  const { key, operator, value } = predicate;
  const actualValue = resolveValue(key, context);
  // Resolve value dynamically if it's a $. path reference
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

/**
 * Evaluate a code-mode condition by constructing a function from the code string
 */
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

/**
 * Evaluate conditions in order and return the index of the first matching
 * condition, or -1 if none match.
 *
 * The compiler appends an `else` (if present in the DSL) as a trailing
 * predicate-less condition, and `evaluatePredicate(undefined)` returns true
 * — so the "else" branch naturally matches here without any special-casing.
 * When there is no else and every predicate is false, we return -1 and let
 * the caller signal the chain to end via a `noMatch` completion flag; we
 * deliberately do NOT fall through to the last condition (see git blame for
 * the prior bug where we did).
 */
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

/**
 * Handle execution of a switch node
 * Evaluates conditions and returns the branch index to follow
 */
export function switchNodeHandler(
  tNode: TNodeEntity,
  node: SwitchNode,
  executionContext: ExecutionContext,
  actor: any
) {
  try {
    const conditions = node.conditions || [];

    brainInspect(`Executing switch node: ${node.label}`, {
      conditionsCount: conditions.length,
      conditions: Array.isArray(conditions) ? conditions.map((c, i) => ({
        index: i,
        label: c.label,
        hasPredicate: !!c.predicate,
      })) : [],
    });

    if (conditions.length === 0) {
      brainLogger.error('Switch node has no conditions:', { nodeLabel: node.label });
      actor.send({
        type: 'ERROR',
        error: 'Switch node has no conditions to evaluate',
      });
      return;
    }

    // Evaluate conditions and get the matching branch index (-1 if none).
    const branchIndex = evaluateConditions(conditions, executionContext);

    if (branchIndex === -1) {
      // No condition matched and there is no else. End this chain cleanly
      // without spawning any downstream step. Other parallel chains in the
      // parent flow (including keep_alive branches) are unaffected.
      brainInspect(`Switch node '${node.label}': no condition matched, ending chain`);
      actor.send({
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

    // Send completion with branch info
    actor.send({
      type: 'COMPLETE',
      result: {
        nodeType: 'switch',  // Explicit type for detection in flow-system
        branchIndex,
        branchLabel: matchedCondition?.label,
        sourceHandle: `branch-${branchIndex}`,
      },
    });
  } catch (error) {
    brainLogger.error('Switch node evaluation failed:', { error, nodeLabel: node.label });

    actor.send({
      type: 'ERROR',
      error: error instanceof Error ? error.message : 'Switch evaluation failed',
    });
  }
}
