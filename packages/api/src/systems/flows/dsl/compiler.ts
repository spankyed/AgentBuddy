/**
 * Flow DSL Compiler
 *
 * Transforms track-based DSL format into EARS database format.
 * Each track creates a listen node + sequential step nodes.
 */

import { EARS } from '@/core/types';
import type {
  FlowDSL,
  Track,
  DSLStepNode,
  DSLActionNode,
  DSLLLMNode,
  DSLSwitchNode,
  DSLFireNode,
  DSLTransformNode,
  DSLQueryNode,
  DSLFlowNode,
  DSLCreateNode,
  DSLUpdateNode,
  DSLKeepAliveNode,
  CompilerContext,
} from './types';
import { BinaryOperator } from '../config/types';

/*─────────────────────────────────────────────────────────────────
 * ID Generation
 *─────────────────────────────────────────────────────────────────*/

function generateId(prefix: string, label: string): string {
  const sanitized = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);

  const hash = simpleHash(label).toString(36).slice(0, 6);
  return `${prefix}-${sanitized}-${hash}`;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/*─────────────────────────────────────────────────────────────────
 * Field Mapping Helpers
 *─────────────────────────────────────────────────────────────────*/

function expandFieldMappings(map?: Record<string, string>): Array<{ target: string; source: string }> | undefined {
  if (!map) return undefined;
  return Object.entries(map).map(([target, source]) => ({ target, source }));
}

/*─────────────────────────────────────────────────────────────────
 * Step Node Compilers
 *─────────────────────────────────────────────────────────────────*/

function compileActionNode(node: DSLActionNode, nodeId: string, ts: number, ctx: CompilerContext): {
  entity: object;
  relations: Array<{ source: string; kind: EARS.RelKind; target: string }>;
} {
  const actionId = ctx.actions.get(node.action);

  return {
    entity: {
      id: nodeId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'action',
      label: node.label || node.action,
      description: node.description,
      actionId: actionId,
      params: node.params,
      fieldMappings: expandFieldMappings(node.map),
      final: node.final,
    },
    relations: actionId ? [
      { source: nodeId, kind: EARS.RelKind.INSTANCE_OF, target: actionId }
    ] : []
  };
}

function compileLLMNode(node: DSLLLMNode, nodeId: string, ts: number, ctx: CompilerContext): {
  entity: object;
  relations: Array<{ source: string; kind: EARS.RelKind; target: string }>;
} {
  const promptId = ctx.prompts.get(node.prompt);

  return {
    entity: {
      id: nodeId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'llm',
      label: node.label || node.prompt,
      description: node.description,
      promptTemplateId: promptId,
      fieldMappings: expandFieldMappings(node.map),
      model: node.model,
      temperature: node.temperature,
      maxTokens: node.maxTokens,
      systemPrompt: node.systemPrompt,
      final: node.final,
    },
    relations: promptId ? [
      { source: nodeId, kind: EARS.RelKind.INSTANCE_OF, target: promptId }
    ] : []
  };
}

/**
 * Parse a DSL expression string into a structured predicate
 * Supports formats like: "$.key == value", "$.count > 10", "$.name contains foo"
 */
function parseExpressionToPredicate(expr: string): { key: string; operator: BinaryOperator; value?: any } | undefined {
  if (!expr || expr.trim() === '') return undefined;  // else/default branch

  const trimmed = expr.trim();

  // Map DSL operators to BinaryOperator enum values
  const operatorMap: Record<string, BinaryOperator> = {
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

  // Try to match operators (longer ones first to avoid partial matches)
  const operatorPatterns = ['>=', '<=', '!=', '==', '>', '<', 'contains', 'starts_with', 'ends_with', 'matches', 'is_empty', 'is_null'];

  for (const op of operatorPatterns) {
    const regex = new RegExp(`^(.+?)\\s*${op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(.*)$`, 'i');
    const match = trimmed.match(regex);

    if (match) {
      const [, key, value] = match;
      const mappedOperator = operatorMap[op.toLowerCase()] || op;

      // For unary operators like is_empty, is_null - no value needed
      if (op === 'is_empty' || op === 'is_null') {
        return {
          key: key.trim(),
          operator: mappedOperator,
        };
      }

      // Parse value - try to detect type (skip for dynamic $. path references)
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

      return {
        key: key.trim(),
        operator: mappedOperator,
        value: parsedValue,
      };
    }
  }

  // Fallback: couldn't parse, return as-is with equals operator
  return {
    key: trimmed,
    operator: BinaryOperator.EQUALS,
    value: true,
  };
}

function compileSwitchNode(node: DSLSwitchNode, nodeId: string, ts: number): object {
  return {
    id: nodeId,
    entityType: EARS.Entity.Node,
    createdAt: ts,
    nodeType: 'switch',
    label: node.label || 'Switch',
    description: node.description,
    conditions: node.conditions.map(c => ({
      predicate: parseExpressionToPredicate(c.if),
      label: c.then,
    })),
    elseLabel: node.else,
    final: node.final,
  };
}

function compileFireNode(node: DSLFireNode, nodeId: string, ts: number): object {
  return {
    id: nodeId,
    entityType: EARS.Entity.Node,
    createdAt: ts,
    nodeType: 'fire',
    label: node.label || node.event,
    description: node.description,
    eventType: node.event,
    scope: node.scope || 'local',
    payload: node.payload,
    final: node.final,
  };
}

function compileTransformNode(node: DSLTransformNode, nodeId: string, ts: number): object {
  return {
    id: nodeId,
    entityType: EARS.Entity.Node,
    createdAt: ts,
    nodeType: 'transform',
    label: node.label || 'Transform',
    description: node.description,
    script: node.script,
    outputType: node.outputType || 'json',
    final: node.final,
  };
}

function compileQueryNode(node: DSLQueryNode, nodeId: string, ts: number): object {
  return {
    id: nodeId,
    entityType: EARS.Entity.Node,
    createdAt: ts,
    nodeType: 'query',
    label: node.label || 'Query',
    description: node.description,
    prompt: node.prompt,
    resultKey: node.as,
    final: node.final,
  };
}

function compileFlowNode(node: DSLFlowNode, nodeId: string, ts: number, ctx: CompilerContext): object {
  const flowRef = ctx.flows.get(node.flow) || node.flow;

  return {
    id: nodeId,
    entityType: EARS.Entity.Node,
    createdAt: ts,
    nodeType: 'flow',
    label: node.label || node.flow,
    description: node.description,
    flowRef,
    propagateCtx: node.inherit !== false,
    fieldMappings: expandFieldMappings(node.map),
    final: node.final,
  };
}

function compileCreateNode(node: DSLCreateNode, nodeId: string, ts: number): object {
  return {
    id: nodeId,
    entityType: EARS.Entity.Node,
    createdAt: ts,
    nodeType: 'create',
    label: node.label || `Create ${node.entity}`,
    description: node.description,
    entityTypeTarget: node.entity as EARS.Entity,
    final: node.final,
  };
}

function compileUpdateNode(node: DSLUpdateNode, nodeId: string, ts: number): object {
  return {
    id: nodeId,
    entityType: EARS.Entity.Node,
    createdAt: ts,
    nodeType: 'update',
    label: node.label || 'Update',
    description: node.description,
    onMissing: node.onMissing,
    final: node.final,
  };
}

function compileKeepAliveNode(node: DSLKeepAliveNode, nodeId: string, ts: number): object {
  return {
    id: nodeId,
    entityType: EARS.Entity.Node,
    createdAt: ts,
    nodeType: 'keep_alive',
    label: node.label || 'Keep Alive',
    description: node.description,
    final: node.final,
  };
}

/*─────────────────────────────────────────────────────────────────
 * Main Compiler
 *─────────────────────────────────────────────────────────────────*/

interface CompileOptions {
  actions?: Map<string, string>;
  prompts?: Map<string, string>;
}

export interface CompiledRows {
  entity: object[];
  relation: Array<{ source: string; kind: EARS.RelKind; target: string; info?: object }>;
  role: Array<{ entityId: string; role: string }>;
}

/**
 * Compile a Flow DSL document into EARS Rows format
 */
export function compile(dsl: FlowDSL, options: CompileOptions = {}): CompiledRows {
  const ts = Date.now();

  const entities: object[] = [];
  const relations: Array<{ source: string; kind: EARS.RelKind; target: string; info?: object }> = [];
  const roles: Array<{ entityId: string; role: string }> = [];

  const ctx: CompilerContext = {
    actions: options.actions || new Map(),
    prompts: options.prompts || new Map(),
    flows: new Map(),
  };

  // First pass: generate flow IDs
  for (const flowName of Object.keys(dsl)) {
    const flowId = generateId('Flow', flowName);
    ctx.flows.set(flowName, flowId);
  }

  // Second pass: compile each flow
  for (const [flowName, tracks] of Object.entries(dsl)) {
    const flowId = ctx.flows.get(flowName)!;
    const { flowEntity, nodeEntities, flowRelations, flowRoles } = compileFlow(
      flowName,
      tracks,
      flowId,
      ts,
      ctx
    );

    entities.push(flowEntity);
    entities.push(...nodeEntities);
    relations.push(...flowRelations);
    roles.push(...flowRoles);
  }

  return {
    entity: entities,
    relation: relations,
    role: roles,
  };
}

function compileFlow(
  flowName: string,
  tracks: Track[],
  flowId: string,
  ts: number,
  ctx: CompilerContext
): {
  flowEntity: object;
  nodeEntities: object[];
  flowRelations: Array<{ source: string; kind: EARS.RelKind; target: string; info?: object }>;
  flowRoles: Array<{ entityId: string; role: string }>;
} {
  const shortCode = `F-${flowName.slice(0, 8).replace(/\s/g, '')}`;

  const flowEntity = {
    id: flowId,
    entityType: EARS.Entity.Flow,
    shortCode,
    label: flowName,
    flowType: 'workflow',
    createdAt: ts,
  };

  const nodeEntities: object[] = [];
  const flowRelations: Array<{ source: string; kind: EARS.RelKind; target: string; info?: object }> = [];
  const flowRoles: Array<{ entityId: string; role: string }> = [];

  // Build global label → nodeId map for cross-track references
  const globalLabelMap = new Map<string, string>();

  // First pass: generate all node IDs
  for (let trackIdx = 0; trackIdx < tracks.length; trackIdx++) {
    const track = tracks[trackIdx];
    const listenLabel = track.label || track.event;
    const listenId = generateId('Node', `${flowName}-${listenLabel}-t${trackIdx}`);
    globalLabelMap.set(listenLabel, listenId);

    for (let stepIdx = 0; stepIdx < track.steps.length; stepIdx++) {
      const step = track.steps[stepIdx];
      const stepLabel = getStepLabel(step, stepIdx);
      const stepId = generateId('Node', `${flowName}-${stepLabel}-t${trackIdx}-s${stepIdx}`);
      globalLabelMap.set(stepLabel, stepId);
    }
  }

  // Second pass: compile tracks
  for (let trackIdx = 0; trackIdx < tracks.length; trackIdx++) {
    const track = tracks[trackIdx];
    const isFirstTrack = trackIdx === 0;

    const { listenEntity, stepEntities, trackRelations, trackRoles } = compileTrack(
      track,
      trackIdx,
      flowName,
      flowId,
      ts,
      ctx,
      isFirstTrack,
      globalLabelMap
    );

    nodeEntities.push(listenEntity);
    nodeEntities.push(...stepEntities);
    flowRelations.push(...trackRelations);
    flowRoles.push(...trackRoles);
  }

  return { flowEntity, nodeEntities, flowRelations, flowRoles };
}

function compileTrack(
  track: Track,
  trackIdx: number,
  flowName: string,
  flowId: string,
  ts: number,
  ctx: CompilerContext,
  isFirstTrack: boolean,
  globalLabelMap: Map<string, string>
): {
  listenEntity: object;
  stepEntities: object[];
  trackRelations: Array<{ source: string; kind: EARS.RelKind; target: string; info?: object }>;
  trackRoles: Array<{ entityId: string; role: string }>;
} {
  const trackRelations: Array<{ source: string; kind: EARS.RelKind; target: string; info?: object }> = [];
  const trackRoles: Array<{ entityId: string; role: string }> = [];
  const stepEntities: object[] = [];

  const listenLabel = track.label || track.event;
  const listenId = globalLabelMap.get(listenLabel)!;

  // Create listen node from track.event
  const listenEntity = {
    id: listenId,
    entityType: EARS.Entity.Node,
    createdAt: ts,
    nodeType: 'listen',
    label: listenLabel,
    description: track.description,
    scope: isFirstTrack ? 'entry' : 'global',
    eventType: track.event,
  };

  // Add CONTAINS for listen node
  trackRelations.push({
    source: flowId,
    kind: EARS.RelKind.CONTAINS,
    target: listenId,
  });

  // Add entry role for first track's listen node
  if (isFirstTrack) {
    trackRoles.push({
      entityId: listenId,
      role: 'entry_event',
    });
  }

  // Compile step nodes
  const stepIds: string[] = [];

  for (let stepIdx = 0; stepIdx < track.steps.length; stepIdx++) {
    const step = track.steps[stepIdx];
    const stepLabel = getStepLabel(step, stepIdx);
    const stepId = globalLabelMap.get(stepLabel)!;
    stepIds.push(stepId);

    const compiled = compileStep(step, stepId, ts, ctx);

    if ('entity' in compiled && 'relations' in compiled) {
      stepEntities.push(compiled.entity);
      trackRelations.push(...compiled.relations);
    } else {
      stepEntities.push(compiled);
    }

    // Add CONTAINS for step node
    trackRelations.push({
      source: flowId,
      kind: EARS.RelKind.CONTAINS,
      target: stepId,
    });
  }

  // Create sequential edges within track
  // listen → first step
  if (stepIds.length > 0) {
    trackRelations.push({
      source: listenId,
      kind: EARS.RelKind.TRANSITIONS_TO,
      target: stepIds[0],
    });
  }

  // step[n] → step[n+1] (with switch/next override handling)
  for (let i = 0; i < track.steps.length; i++) {
    const step = track.steps[i];
    const stepId = stepIds[i];

    // Handle switch nodes
    if (step.type === 'switch') {
      for (const condition of step.conditions) {
        const targetId = globalLabelMap.get(condition.then);
        if (targetId) {
          trackRelations.push({
            source: stepId,
            kind: EARS.RelKind.TRANSITIONS_TO,
            target: targetId,
            info: { condition: condition.then },
          });
        }
      }
      if (step.else) {
        const elseTargetId = globalLabelMap.get(step.else);
        if (elseTargetId) {
          trackRelations.push({
            source: stepId,
            kind: EARS.RelKind.TRANSITIONS_TO,
            target: elseTargetId,
            info: { condition: 'else' },
          });
        }
      }
      continue;
    }

    // Handle explicit 'next' override
    if (step.next) {
      const targetId = globalLabelMap.get(step.next);
      if (targetId) {
        trackRelations.push({
          source: stepId,
          kind: EARS.RelKind.TRANSITIONS_TO,
          target: targetId,
        });
      }
      continue;
    }

    // Default: sequential edge to next step
    if (i < stepIds.length - 1) {
      trackRelations.push({
        source: stepId,
        kind: EARS.RelKind.TRANSITIONS_TO,
        target: stepIds[i + 1],
      });
    }
  }

  return { listenEntity, stepEntities, trackRelations, trackRoles };
}

function getStepLabel(step: DSLStepNode, index: number): string {
  if (step.label) return step.label;

  switch (step.type) {
    case 'action': return step.action;
    case 'llm': return step.prompt;
    case 'fire': return step.event;
    case 'flow': return step.flow;
    case 'switch': return `Switch ${index}`;
    case 'transform': return `Transform ${index}`;
    case 'query': return `Query ${index}`;
    case 'create': return `Create ${step.entity}`;
    case 'update': return `Update ${index}`;
    case 'keep_alive': return `Keep Alive ${index}`;
    default: return `Step ${index}`;
  }
}

function compileStep(
  step: DSLStepNode,
  stepId: string,
  ts: number,
  ctx: CompilerContext
): object | { entity: object; relations: Array<{ source: string; kind: EARS.RelKind; target: string }> } {
  switch (step.type) {
    case 'action':
      return compileActionNode(step, stepId, ts, ctx);
    case 'llm':
      return compileLLMNode(step, stepId, ts, ctx);
    case 'switch':
      return compileSwitchNode(step, stepId, ts);
    case 'fire':
      return compileFireNode(step, stepId, ts);
    case 'transform':
      return compileTransformNode(step, stepId, ts);
    case 'query':
      return compileQueryNode(step, stepId, ts);
    case 'flow':
      return compileFlowNode(step, stepId, ts, ctx);
    case 'create':
      return compileCreateNode(step, stepId, ts);
    case 'update':
      return compileUpdateNode(step, stepId, ts);
    case 'keep_alive':
      return compileKeepAliveNode(step, stepId, ts);
  }
}

export default compile;
