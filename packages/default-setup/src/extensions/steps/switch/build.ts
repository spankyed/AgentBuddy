import type { StepDefinition } from '@abuddy/sdk/steps';
import type { StepCompileResult, StepValidationError, StepValidationContext, StepCompileContext, StepDecompileContext, StepBranch } from '@abuddy/sdk/steps';
import { BinaryOperator, BinaryOperator as Op } from '@abuddy/sdk/utils';
import { EARS } from '@abuddy/sdk';

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

export function compile(node: Record<string, unknown>, nodeId: string, ts: number, _ctx: StepCompileContext): StepCompileResult {
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

export function validate(s: Record<string, unknown>, path: string, _ctx: StepValidationContext): StepValidationError[] {
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

export function getLabel(step: Record<string, unknown>, index: number): string {
  if (typeof step.label === 'string') return step.label;
  return `Switch ${index}`;
}

const operatorToDsl: Record<string, string> = {
  equals: '==', not_equals: '!=', greater_than: '>', less_than: '<',
  greater_than_or_equals: '>=', less_than_or_equals: '<=',
  contains: 'contains', starts_with: 'starts_with', ends_with: 'ends_with',
  matches: 'matches', is_empty: 'is_empty', is_null: 'is_null',
};

export function decompile(node: Record<string, unknown>, ctx: StepDecompileContext): Record<string, unknown> {
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

export function branches(node: Record<string, unknown>): StepBranch[] {
  const result: StepBranch[] = [];
  const conditions = (node.conditions as any[]) ?? [];
  for (let i = 0; i < conditions.length; i++) {
    if (Array.isArray(conditions[i].steps)) {
      result.push({ key: `c${i}`, steps: conditions[i].steps });
    }
  }
  if (Array.isArray(node.else) && (node.else as any[]).length > 0) {
    result.push({ key: 'else', steps: node.else as any[] });
  }
  return result;
}

/** Build-time facets only (no runtime or FE imports); loaded by `abuddy build` in dependent packs. */
export const switchStepBuild: StepDefinition = {
  type: 'switch',
  build: { compile, validate, getLabel, decompile, branches },
};
