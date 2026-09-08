/**
 * Minimal step definitions for compiler tests.
 *
 * These replicate the essential compile/getLabel/branches behavior from
 * the pack's step definitions so the SDK compiler tests can run without
 * importing pack code.
 */
import type { StepDefinition, StepBranch } from '../../../src/steps/types';
import { BinaryOperator } from '../../../src/utils/index';
import { expandRecord, collapseRecord } from '../../../src/steps/utils';

function nodeEntity(nodeId: string, ts: number, nodeType: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: nodeId, entityType: 'Node', createdAt: ts, nodeType, ...extra };
}

/* ── Triggers ──────────────────────────────────────────────────── */

export const listenerTrigger: StepDefinition = {
  type: 'listener',
  kind: 'trigger',
  trigger: {
    trackField: 'event',
    compile(track, trackId, ts, trackKey) {
      const t = track as Record<string, unknown>;
      return {
        id: trackId, entityType: 'Node', createdAt: ts,
        nodeType: 'listener',
        label: t.label || t.event || 'Listener',
        description: t.description,
        trackKey,
        scope: t.isFirstTrack ? 'entry' : 'global',
        eventType: t.event,
      };
    },
    decompile(node) {
      return { event: (node as any).eventType || (node as any).label || 'unknown' };
    },
  },
};

export const scheduleTrigger: StepDefinition = {
  type: 'schedule',
  kind: 'trigger',
  trigger: {
    trackField: 'schedule',
    compile(track, trackId, ts, trackKey) {
      const t = track as Record<string, unknown>;
      return {
        id: trackId, entityType: 'Node', createdAt: ts,
        nodeType: 'schedule',
        label: (t as any).label || 'Schedule',
        description: (t as any).description,
        trackKey,
        cronExpression: (t as any).schedule,
      };
    },
    decompile(node) {
      return { schedule: (node as any).cronExpression };
    },
    persistent: true,
  },
};

/* ── Steps ─────────────────────────────────────────────────────── */

export const actionStep: StepDefinition = {
  type: 'action',
  build: {
    compile(node, nodeId, ts, ctx) {
      const actionId = ctx.actions.get(node.action as string);
      return {
        entity: nodeEntity(nodeId, ts, 'action', {
          label: (node.label as string) || (node.action as string),
          description: node.description,
          actionId,
          params: node.params,
          fieldMappings: expandRecord(node.map as Record<string, string> | undefined),
          final: node.final,
        }),
        relations: actionId ? [{ source: nodeId, kind: 'instance_of', target: actionId }] : [],
      };
    },
    validate: () => [],
    getLabel(step, index) {
      return (step.label as string) || (step.action as string) || `Action ${index}`;
    },
    decompile(node, ctx) {
      const actionLabel = node.actionId ? ctx.actionMap.get(node.actionId as string) || node.actionId : node.label || 'Unknown Action';
      const dsl: Record<string, unknown> = { type: 'action', action: actionLabel };
      if (node.label && node.label !== actionLabel) dsl.label = node.label;
      if (node.description) dsl.description = node.description;
      if (node.final) dsl.final = true;
      const map = collapseRecord(node.fieldMappings as any);
      if (map) dsl.map = map;
      if (node.params && Object.keys(node.params as any).length > 0) dsl.params = node.params;
      return dsl;
    },
    relation: { field: 'actionId', targetEntity: 'Action' },
  },
};

export const llmStep: StepDefinition = {
  type: 'llm',
  build: {
    compile(node, nodeId, ts, ctx) {
      const promptId = ctx.prompts.get(node.prompt as string);
      return {
        entity: nodeEntity(nodeId, ts, 'llm', {
          label: (node.label as string) || (node.prompt as string) || `LLM`,
          description: node.description,
          promptTemplateId: promptId,
          model: node.model,
          temperature: node.temperature,
          maxTokens: node.maxTokens,
          systemPrompt: node.systemPrompt,
          fieldMappings: expandRecord(node.map as Record<string, string> | undefined),
        }),
        relations: promptId ? [{ source: nodeId, kind: 'instance_of', target: promptId }] : [],
      };
    },
    validate: () => [],
    getLabel(step, index) {
      return (step.label as string) || (step.prompt as string) || `LLM ${index}`;
    },
    decompile(node, ctx) {
      const promptLabel = node.promptTemplateId ? ctx.promptMap.get(node.promptTemplateId as string) || node.promptTemplateId : node.label || 'Unknown Prompt';
      const dsl: Record<string, unknown> = { type: 'llm', prompt: promptLabel };
      if (node.label && node.label !== promptLabel) dsl.label = node.label;
      if (node.description) dsl.description = node.description;
      if (node.model) dsl.model = node.model;
      if (node.temperature !== undefined) dsl.temperature = node.temperature;
      if (node.maxTokens !== undefined) dsl.maxTokens = node.maxTokens;
      if (node.systemPrompt) dsl.systemPrompt = node.systemPrompt;
      const map = collapseRecord(node.fieldMappings as any);
      if (map) dsl.map = map;
      return dsl;
    },
    relation: { field: 'promptTemplateId', targetEntity: 'Prompt' },
  },
};

export const fireStep: StepDefinition = {
  type: 'fire',
  build: {
    compile(node, nodeId, ts) {
      return {
        entity: nodeEntity(nodeId, ts, 'fire', {
          label: (node.label as string) || (node.event as string) || 'Fire',
          eventType: node.event,
          scope: node.scope || 'local',
          payload: node.payload,
        }),
        relations: [],
      };
    },
    validate: () => [],
    decompile(node) {
      const dsl: Record<string, unknown> = { type: 'fire', event: node.eventType };
      if (node.label && node.label !== node.eventType) dsl.label = node.label;
      if (node.scope && node.scope !== 'local') dsl.scope = node.scope;
      if (node.payload && Object.keys(node.payload as any).length > 0) dsl.payload = node.payload;
      return dsl;
    },
    getLabel(step, index) {
      return (step.label as string) || (step.event as string) || `Fire ${index}`;
    },
  },
};

export const transformStep: StepDefinition = {
  type: 'transform',
  build: {
    compile(node, nodeId, ts) {
      return {
        entity: nodeEntity(nodeId, ts, 'transform', {
          label: (node.label as string) || 'Transform',
          script: node.script,
          outputType: node.outputType,
        }),
        relations: [],
      };
    },
    validate: () => [],
    decompile(node) {
      const dsl: Record<string, unknown> = { type: 'transform' };
      if (node.label) dsl.label = node.label;
      if (node.script) dsl.script = node.script;
      if (node.outputType) dsl.outputType = node.outputType;
      return dsl;
    },
    getLabel(step, index) {
      return (step.label as string) || `Transform ${index}`;
    },
  },
};

export const queryStep: StepDefinition = {
  type: 'query',
  build: {
    compile(node, nodeId, ts) {
      return {
        entity: nodeEntity(nodeId, ts, 'query', {
          label: (node.label as string) || (node.prompt as string) || 'Query',
          prompt: node.prompt,
          resultKey: node.as,
        }),
        relations: [],
      };
    },
    validate: () => [],
    decompile(node) {
      const dsl: Record<string, unknown> = { type: 'query', prompt: node.prompt };
      if (node.label) dsl.label = node.label;
      if (node.resultKey) dsl.as = node.resultKey;
      return dsl;
    },
    getLabel(step, index) {
      return (step.label as string) || (step.prompt as string) || `Query ${index}`;
    },
  },
};

export const flowStep: StepDefinition = {
  type: 'subflow',
  build: {
    compile(node, nodeId, ts, ctx) {
      const flowRef = ctx.flows.get(node.flow as string);
      return {
        entity: nodeEntity(nodeId, ts, 'subflow', {
          label: (node.label as string) || (node.flow as string) || 'Flow',
          flowRef,
          propagateCtx: node.inherit !== false,
          fieldMappings: expandRecord(node.map as Record<string, string> | undefined),
        }),
        relations: [],
      };
    },
    validate: () => [],
    decompile(node, ctx) {
      const flowLabel = node.flowRef ? ctx.flowMap.get(node.flowRef as string) || node.flowRef : node.label || 'Unknown Flow';
      const dsl: Record<string, unknown> = { type: 'subflow', flow: flowLabel };
      if (node.label && node.label !== flowLabel) dsl.label = node.label;
      if (node.description) dsl.description = node.description;
      if (node.final) dsl.final = true;
      if (node.propagateCtx === false) dsl.inherit = false;
      const map = collapseRecord(node.fieldMappings as any);
      if (map) dsl.map = map;
      return dsl;
    },
    getLabel(step, index) {
      return (step.label as string) || (step.flow as string) || `Flow ${index}`;
    },
  },
};

export const createStep: StepDefinition = {
  type: 'create',
  build: {
    compile(node, nodeId, ts) {
      return {
        entity: nodeEntity(nodeId, ts, 'create', {
          label: (node.label as string) || (node.entity as string) || 'Create',
          entityTypeTarget: node.entity,
        }),
        relations: [],
      };
    },
    validate: () => [],
    decompile(node) {
      const dsl: Record<string, unknown> = { type: 'create', entity: node.entityTypeTarget };
      if (node.label) dsl.label = node.label;
      if (node.description) dsl.description = node.description;
      if (node.final) dsl.final = true;
      return dsl;
    },
    getLabel(step, index) {
      return (step.label as string) || (step.entity as string) || `Create ${index}`;
    },
  },
};

export const updateStep: StepDefinition = {
  type: 'update',
  build: {
    compile(node, nodeId, ts) {
      return {
        entity: nodeEntity(nodeId, ts, 'update', {
          label: (node.label as string) || 'Update',
          onMissing: node.onMissing,
        }),
        relations: [],
      };
    },
    validate: () => [],
    decompile(node) {
      const dsl: Record<string, unknown> = { type: 'update' };
      if (node.entityId) dsl.target = node.entityId;
      if (node.label) dsl.label = node.label;
      if (node.description) dsl.description = node.description;
      if (node.final) dsl.final = true;
      if (node.onMissing) dsl.onMissing = node.onMissing;
      return dsl;
    },
    getLabel(step, index) {
      return (step.label as string) || `Update ${index}`;
    },
  },
};

export const keepAliveStep: StepDefinition = {
  type: 'keep_alive',
  build: {
    compile(node, nodeId, ts) {
      return {
        entity: nodeEntity(nodeId, ts, 'keep_alive', {
          label: (node.label as string) || 'Keep Alive',
        }),
        relations: [],
      };
    },
    validate: () => [],
    decompile(node) {
      const dsl: Record<string, unknown> = { type: 'keep_alive' };
      if (node.label) dsl.label = node.label;
      if (node.description) dsl.description = node.description;
      if (node.final) dsl.final = true;
      return dsl;
    },
    getLabel(step, index) {
      return (step.label as string) || `Keep Alive ${index}`;
    },
  },
};

/* ── Switch (with expression parser + branches) ────────────────── */

function parseExpressionToPredicate(expr: string): { key: string; operator: BinaryOperator; value?: any } | undefined {
  if (!expr || expr.trim() === '') return undefined;
  const trimmed = expr.trim();

  const operatorMap: Record<string, BinaryOperator> = {
    '===': BinaryOperator.EQUALS,
    '!==': BinaryOperator.NOT_EQUALS,
    '==': BinaryOperator.EQUALS,
    '!=': BinaryOperator.NOT_EQUALS,
    '>=': BinaryOperator.GREATER_THAN_OR_EQUALS,
    '<=': BinaryOperator.LESS_THAN_OR_EQUALS,
    '>': BinaryOperator.GREATER_THAN,
    '<': BinaryOperator.LESS_THAN,
    'contains': BinaryOperator.CONTAINS,
    'starts_with': BinaryOperator.STARTS_WITH,
    'ends_with': BinaryOperator.ENDS_WITH,
    'matches': BinaryOperator.MATCHES,
    'is_empty': BinaryOperator.IS_EMPTY,
    'is_null': BinaryOperator.IS_NULL,
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

  return { key: trimmed, operator: BinaryOperator.EQUALS, value: true };
}

export const switchStep: StepDefinition = {
  type: 'switch',
  build: {
    compile(node, nodeId, ts) {
      const conditions = (node.conditions as any[]).map((c: any, ci: number) => ({
        predicate: parseExpressionToPredicate(c.if),
        label: c.steps?.length > 0 ? (c.steps[0].label || c.steps[0].type || `branch-${ci}`) : `branch-${ci}`,
      }));

      if (Array.isArray(node.else) && (node.else as any[]).length > 0) {
        const elseSteps = node.else as any[];
        conditions.push({
          predicate: undefined as any,
          label: elseSteps[0].label || elseSteps[0].type || `else`,
        });
      }

      return {
        entity: nodeEntity(nodeId, ts, 'switch', {
          label: (node.label as string) || 'Switch',
          description: node.description,
          conditions,
          final: node.final,
        }),
        relations: [],
      };
    },
    validate: () => [],
    decompile(node, ctx) {
      const operatorToDsl: Record<string, string> = {
        equals: '==', not_equals: '!=', greater_than: '>', less_than: '<',
        greater_than_or_equals: '>=', less_than_or_equals: '<=',
        contains: 'contains', starts_with: 'starts_with', ends_with: 'ends_with',
        matches: 'matches', is_empty: 'is_empty', is_null: 'is_null',
      };
      const conditions = (Array.isArray(node.conditions) ? node.conditions : []) as Array<{
        predicate?: { key: string; operator: string; value?: unknown };
        label?: string;
      }>;
      const validConditions = conditions.filter(c => {
        if (!c.predicate) return false;
        return (c.predicate as any).key && (c.predicate as any).key.trim() !== '';
      });
      const dsl: Record<string, unknown> = {
        type: 'switch',
        conditions: validConditions.map((c) => {
          let ifExpr = '';
          if (c.predicate) {
            const opSymbol = operatorToDsl[c.predicate.operator] || c.predicate.operator;
            if (c.predicate.operator === 'is_empty' || c.predicate.operator === 'is_null') {
              ifExpr = `${c.predicate.key} ${opSymbol}`;
            } else {
              ifExpr = `${c.predicate.key} ${opSymbol} ${c.predicate.value ?? ''}`;
            }
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
    },
    getLabel(step, index) {
      return (step.label as string) || `Switch ${index}`;
    },
    branches(node: Record<string, unknown>): StepBranch[] {
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
    },
  },
};

/* ── All test steps ────────────────────────────────────────────── */

export const ALL_TEST_STEPS: StepDefinition[] = [
  listenerTrigger,
  scheduleTrigger,
  actionStep,
  llmStep,
  fireStep,
  transformStep,
  queryStep,
  flowStep,
  createStep,
  updateStep,
  keepAliveStep,
  switchStep,
];
