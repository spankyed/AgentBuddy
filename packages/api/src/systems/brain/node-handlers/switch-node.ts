import type { SwitchNode, Condition, Predicate, BinaryOperator } from '@/systems/flows/config/types';
import { BinaryOperator as Op } from '@/systems/flows/config/types';
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
 * Evaluate conditions in order and return the index of the first matching condition
 * The last condition is typically the else/default (has no predicate)
 */
function evaluateConditions(conditions: Condition[], context: ExecutionContext): number {
  for (let i = 0; i < conditions.length; i++) {
    const condition = conditions[i];
    const matches = evaluatePredicate(condition.predicate, context);

    brainInspect(`Condition ${i} (${condition.label || 'unlabeled'}): ${matches ? 'MATCHED' : 'no match'}`);

    if (matches) {
      return i;
    }
  }

  // This shouldn't happen if the last condition is always the else (no predicate)
  // But just in case, return the last index as fallback
  brainLogger.warn('No condition matched and no else branch found, using last condition');
  return conditions.length - 1;
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
  const conditions = node.conditions || [];

  brainInspect(`Executing switch node: ${node.label}`, {
    conditionsCount: conditions.length,
    conditions: conditions.map((c, i) => ({
      index: i,
      label: c.label,
      hasPredicate: !!c.predicate,
    })),
  });

  if (conditions.length === 0) {
    brainLogger.error('Switch node has no conditions:', { nodeLabel: node.label });
    actor.send({
      type: 'ERROR',
      error: 'Switch node has no conditions to evaluate',
    });
    return;
  }

  try {
    // Evaluate conditions and get the matching branch index
    const branchIndex = evaluateConditions(conditions, executionContext);
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
