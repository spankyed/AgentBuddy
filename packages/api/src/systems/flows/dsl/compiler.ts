/**
 * Flow DSL Compiler
 *
 * Transforms track-based DSL format into EARS database format.
 * Each track creates a listener node + sequential step nodes.
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
  DSLKillNode,
  CompilerContext,
} from './types';
import { isFlowConfig, resolveTracks, ROOT_FLOW_ROLE } from './types';
import { BinaryOperator } from '../config/types';

/*─────────────────────────────────────────────────────────────────
 * Types
 *─────────────────────────────────────────────────────────────────*/

type Relation = { source: string; kind: EARS.RelKind; target: string; info?: object };

interface StepResult {
  entity: object;
  relations: Relation[];
}

/** Bundled context threaded through compilation functions */
interface FlowCompileCtx {
  flowId: string;
  flowName: string;
  ts: number;
  ctx: CompilerContext;
  globalLabelMap: Map<string, string>;
  inlineStepIds: Map<string, string>;
}

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

function compileActionNode(node: DSLActionNode, nodeId: string, ts: number, ctx: CompilerContext): StepResult {
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

function compileLLMNode(node: DSLLLMNode, nodeId: string, ts: number, ctx: CompilerContext): StepResult {
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

  // Map DSL operators to BinaryOperator enum values.
  // `===` / `!==` map to the same enum as `==` / `!=` — the runtime
  // evaluator uses loose comparison regardless, and accepting both forms
  // prevents silent breakage when authors write JS-idiomatic strict equality
  // (see the stray `= 'value'` regression in flow conditions).
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

  // Try to match operators (longer ones first to avoid partial matches —
  // `===` / `!==` must come before `==` / `!=` so the non-greedy key regex
  // doesn't split inside a strict-equality token).
  const operatorPatterns = ['===', '!==', '>=', '<=', '!=', '==', '>', '<', 'contains', 'starts_with', 'ends_with', 'matches', 'is_empty', 'is_null'];

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

function compileSwitchNode(node: DSLSwitchNode, nodeId: string, ts: number): StepResult {
  const conditions: Array<{ predicate: ReturnType<typeof parseExpressionToPredicate>; label: string }> = node.conditions.map((c, ci) => ({
    predicate: parseExpressionToPredicate(c.if),
    label: c.steps.length > 0 ? getStepLabel(c.steps[0], ci) : `branch-${ci}`,
  }));

  // Append an else condition (empty predicate) to match UI convention
  // so SwitchNode.vue renders a handle for the else branch
  if (node.else && node.else.length > 0) {
    conditions.push({
      predicate: undefined,
      label: getStepLabel(node.else[0], node.conditions.length),
    });
  }

  return {
    entity: {
      id: nodeId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'switch',
      label: node.label || 'Switch',
      description: node.description,
      conditions,
      final: node.final,
    },
    relations: [],
  };
}

function compileFireNode(node: DSLFireNode, nodeId: string, ts: number): StepResult {
  return {
    entity: {
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
    },
    relations: [],
  };
}

function compileTransformNode(node: DSLTransformNode, nodeId: string, ts: number): StepResult {
  return {
    entity: {
      id: nodeId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'transform',
      label: node.label || 'Transform',
      description: node.description,
      script: node.script,
      outputType: node.outputType || 'json',
      final: node.final,
    },
    relations: [],
  };
}

function compileQueryNode(node: DSLQueryNode, nodeId: string, ts: number): StepResult {
  return {
    entity: {
      id: nodeId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'query',
      label: node.label || 'Query',
      description: node.description,
      prompt: node.prompt,
      resultKey: node.as,
      final: node.final,
    },
    relations: [],
  };
}

function compileFlowNode(node: DSLFlowNode, nodeId: string, ts: number, ctx: CompilerContext): StepResult {
  const flowRef = ctx.flows.get(node.flow) || node.flow;

  return {
    entity: {
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
    },
    relations: [],
  };
}

function compileCreateNode(node: DSLCreateNode, nodeId: string, ts: number): StepResult {
  return {
    entity: {
      id: nodeId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'create',
      label: node.label || `Create ${node.entity}`,
      description: node.description,
      entityTypeTarget: node.entity as EARS.Entity,
      final: node.final,
    },
    relations: [],
  };
}

function compileUpdateNode(node: DSLUpdateNode, nodeId: string, ts: number): StepResult {
  return {
    entity: {
      id: nodeId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'update',
      label: node.label || 'Update',
      description: node.description,
      onMissing: node.onMissing,
      final: node.final,
    },
    relations: [],
  };
}

function compileKeepAliveNode(node: DSLKeepAliveNode, nodeId: string, ts: number): StepResult {
  return {
    entity: {
      id: nodeId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'keep_alive',
      label: node.label || 'Keep Alive',
      description: node.description,
      final: node.final,
    },
    relations: [],
  };
}

function compileKillNode(node: DSLKillNode, nodeId: string, ts: number): StepResult {
  return {
    entity: {
      id: nodeId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'kill',
      label: node.label || 'Kill Flow',
      description: node.description,
    },
    relations: [],
  };
}

/*─────────────────────────────────────────────────────────────────
 * Inline Branch Helpers
 *─────────────────────────────────────────────────────────────────*/

/**
 * Register inline step IDs for a list of steps at a given path prefix.
 * Generates IDs, stores in inlineStepIds, and registers labels in globalLabelMap.
 */
function registerInlineSteps(
  steps: DSLStepNode[],
  flowName: string,
  pathPrefix: string,
  globalLabelMap: Map<string, string>,
  inlineStepIds: Map<string, string>,
): void {
  for (let si = 0; si < steps.length; si++) {
    const step = steps[si];
    const label = getStepLabel(step, si);
    const key = `${pathPrefix}-i${si}`;
    const id = generateId('Node', `${flowName}-${label}-${key}`);
    inlineStepIds.set(key, id);

    if (step.label) {
      globalLabelMap.set(step.label, id);
    }

    if (step.type === 'switch') {
      registerInlineSwitchStepIds(step, flowName, key, globalLabelMap, inlineStepIds);
    }
  }
}

/**
 * First-pass helper: generate IDs for inline steps inside switch conditions.
 * Stores IDs in `inlineStepIds` keyed by path (e.g., "t0-s2-c0-i0").
 * Only registers explicit labels in `globalLabelMap` (for cross-references via `next`).
 */
function registerInlineSwitchStepIds(
  switchStep: DSLSwitchNode,
  flowName: string,
  pathPrefix: string,
  globalLabelMap: Map<string, string>,
  inlineStepIds: Map<string, string>,
): void {
  for (let ci = 0; ci < switchStep.conditions.length; ci++) {
    const condition = switchStep.conditions[ci];
    if (condition.steps) {
      registerInlineSteps(condition.steps, flowName, `${pathPrefix}-c${ci}`, globalLabelMap, inlineStepIds);
    }
  }

  if (Array.isArray(switchStep.else) && switchStep.else.length > 0) {
    registerInlineSteps(switchStep.else, flowName, `${pathPrefix}-else`, globalLabelMap, inlineStepIds);
  }
}

/*─────────────────────────────────────────────────────────────────
 * Unified Step List Compiler
 *─────────────────────────────────────────────────────────────────*/

/**
 * Compile a list of steps into entities and relations, wiring sequential edges.
 * Used by both top-level tracks and inline switch branches.
 *
 * @param stepKeys - parallel to stepIds, each entry is the path key for that step
 *                   (e.g., "t0-s2" for top-level, "t0-s2-c0-i1" for inline)
 */
function compileStepList(
  steps: DSLStepNode[],
  stepIds: string[],
  stepKeys: string[],
  fCtx: FlowCompileCtx,
  out: { entities: object[]; relations: Relation[] },
  continuationId?: string,
): void {
  // Compile each step
  for (let si = 0; si < steps.length; si++) {
    const step = steps[si];
    const stepId = stepIds[si];

    const { entity, relations } = compileStep(step, stepId, fCtx.ts, fCtx.ctx);
    out.entities.push(entity);
    out.relations.push(...relations);

    out.relations.push({
      source: fCtx.flowId,
      kind: EARS.RelKind.CONTAINS,
      target: stepId,
    });
  }

  // Wire edges
  for (let si = 0; si < steps.length; si++) {
    const step = steps[si];
    const stepId = stepIds[si];

    if (step.type === 'switch') {
      const switchContinuation = si < stepIds.length - 1 ? stepIds[si + 1] : continuationId;
      wireSwitchEdges(step, stepId, stepKeys[si], fCtx, out, switchContinuation);
      continue;
    }

    if (step.next) {
      const targetId = fCtx.globalLabelMap.get(step.next);
      if (targetId) {
        out.relations.push({
          source: stepId,
          kind: EARS.RelKind.TRANSITIONS_TO,
          target: targetId,
        });
      }
      continue;
    }

    if (si < stepIds.length - 1) {
      out.relations.push({
        source: stepId,
        kind: EARS.RelKind.TRANSITIONS_TO,
        target: stepIds[si + 1],
      });
    } else if (continuationId) {
      out.relations.push({
        source: stepId,
        kind: EARS.RelKind.TRANSITIONS_TO,
        target: continuationId,
      });
    }
  }
}

/**
 * Wire TRANSITIONS_TO edges from a switch node to its inline branch targets.
 * Each branch's last step wires to the continuationId (implicit convergence).
 */
function wireSwitchEdges(
  step: DSLSwitchNode,
  stepId: string,
  switchKey: string,
  fCtx: FlowCompileCtx,
  out: { entities: object[]; relations: Relation[] },
  continuationId?: string,
): void {
  for (let ci = 0; ci < step.conditions.length; ci++) {
    const condition = step.conditions[ci];

    if (condition.steps && condition.steps.length > 0) {
      const branchPrefix = `${switchKey}-c${ci}`;
      const firstInlineId = fCtx.inlineStepIds.get(`${branchPrefix}-i0`)!;

      out.relations.push({
        source: stepId,
        kind: EARS.RelKind.TRANSITIONS_TO,
        target: firstInlineId,
        info: { sourceHandle: `branch-${ci}` },
      });

      const inlineIds = condition.steps.map((_, si) => fCtx.inlineStepIds.get(`${branchPrefix}-i${si}`)!);
      const inlineKeys = condition.steps.map((_, si) => `${branchPrefix}-i${si}`);
      compileStepList(condition.steps, inlineIds, inlineKeys, fCtx, out, continuationId);
    }
  }

  if (step.else && step.else.length > 0) {
    const elsePrefix = `${switchKey}-else`;
    const firstElseId = fCtx.inlineStepIds.get(`${elsePrefix}-i0`)!;

    out.relations.push({
      source: stepId,
      kind: EARS.RelKind.TRANSITIONS_TO,
      target: firstElseId,
      info: { sourceHandle: `branch-${step.conditions.length}`, condition: 'else' },
    });

    const elseIds = step.else.map((_, si) => fCtx.inlineStepIds.get(`${elsePrefix}-i${si}`)!);
    const elseKeys = step.else.map((_, si) => `${elsePrefix}-i${si}`);
    compileStepList(step.else, elseIds, elseKeys, fCtx, out, continuationId);
  }
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
  relation: Relation[];
  role: Array<{ entityId: string; role: string }>;
}

/**
 * Compile a Flow DSL document into EARS Rows format
 */
export function compile(dsl: FlowDSL, options: CompileOptions = {}): CompiledRows {
  const ts = Date.now();

  const entities: object[] = [];
  const relations: Relation[] = [];
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
  for (const [flowName, entry] of Object.entries(dsl)) {
    const tracks = resolveTracks(entry);
    const flowId = ctx.flows.get(flowName)!;
    const { flowEntity, nodeEntities, flowRelations, flowRoles } = compileFlow(
      flowName,
      tracks,
      flowId,
      ts,
      ctx
    );

    // Attach sourceHash from compiled FlowConfig if present
    const sourceHash = isFlowConfig(entry) ? entry.sourceHash : undefined;
    entities.push(sourceHash ? { ...flowEntity, sourceHash } : flowEntity);
    entities.push(...nodeEntities);
    relations.push(...flowRelations);
    roles.push(...flowRoles);

    // Emit root_flow role if flagged
    if (isFlowConfig(entry) && entry.root) {
      roles.push({ entityId: flowId, role: ROOT_FLOW_ROLE });
    }
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
  flowRelations: Relation[];
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
  const flowRelations: Relation[] = [];
  const flowRoles: Array<{ entityId: string; role: string }> = [];

  // Build global label -> nodeId map for cross-track references
  const globalLabelMap = new Map<string, string>();
  const inlineStepIds = new Map<string, string>();

  // First pass: generate all node IDs
  for (let trackIdx = 0; trackIdx < tracks.length; trackIdx++) {
    const track = tracks[trackIdx];
    const listenerLabel = track.label || track.event || `Schedule ${trackIdx}`;
    const listenerId = generateId('Node', `${flowName}-${listenerLabel}-t${trackIdx}`);
    globalLabelMap.set(listenerLabel, listenerId);

    for (let exitIdx = 0; exitIdx < track.exits.length; exitIdx++) {
      const exitSteps = track.exits[exitIdx];
      for (let stepIdx = 0; stepIdx < exitSteps.length; stepIdx++) {
        const step = exitSteps[stepIdx];
        const stepLabel = getStepLabel(step, stepIdx);
        const stepId = generateId('Node', `${flowName}-${stepLabel}-t${trackIdx}-e${exitIdx}-s${stepIdx}`);
        if (globalLabelMap.has(stepLabel)) {
          throw new Error(`Duplicate step label "${stepLabel}" in flow "${flowName}" (track ${trackIdx}, exit ${exitIdx}, step ${stepIdx}). Use explicit labels to disambiguate.`);
        }
        globalLabelMap.set(stepLabel, stepId);

        // Register inline step IDs for switch nodes with inline branches
        if (step.type === 'switch') {
          registerInlineSwitchStepIds(step, flowName, `t${trackIdx}-e${exitIdx}-s${stepIdx}`, globalLabelMap, inlineStepIds);
        }
      }
    }
  }

  const fCtx: FlowCompileCtx = { flowId, flowName, ts, ctx, globalLabelMap, inlineStepIds };

  // Second pass: compile tracks
  for (let trackIdx = 0; trackIdx < tracks.length; trackIdx++) {
    const track = tracks[trackIdx];
    const isFirstTrack = trackIdx === 0;

    const { listenerEntity, trackRoles } = compileTrack(
      track,
      trackIdx,
      isFirstTrack,
      fCtx,
      nodeEntities,
      flowRelations,
    );

    nodeEntities.push(listenerEntity);
    flowRoles.push(...trackRoles);
  }

  return { flowEntity, nodeEntities, flowRelations, flowRoles };
}

function compileTrack(
  track: Track,
  trackIdx: number,
  isFirstTrack: boolean,
  fCtx: FlowCompileCtx,
  nodeEntities: object[],
  trackRelations: Relation[],
): {
  listenerEntity: object;
  trackRoles: Array<{ entityId: string; role: string }>;
} {
  const trackRoles: Array<{ entityId: string; role: string }> = [];

  const isScheduleTrack = !!track.schedule;
  const listenerLabel = track.label || track.event || `Schedule ${trackIdx}`;
  const listenerId = fCtx.globalLabelMap.get(listenerLabel)!;
  const trackKey = `${fCtx.flowName}:track:${trackIdx}`;

  // Create trigger node (listener or schedule) from track
  const listenerEntity = isScheduleTrack
    ? {
        id: listenerId,
        entityType: EARS.Entity.Node,
        createdAt: fCtx.ts,
        nodeType: 'schedule',
        label: listenerLabel,
        description: track.description,
        trackKey,
        cronExpression: track.schedule,
      }
    : {
        id: listenerId,
        entityType: EARS.Entity.Node,
        createdAt: fCtx.ts,
        nodeType: 'listener',
        label: listenerLabel,
        description: track.description,
        trackKey,
        scope: isFirstTrack ? 'entry' : 'global',
        eventType: track.event!,
      };

  // Add CONTAINS for trigger node
  trackRelations.push({
    source: fCtx.flowId,
    kind: EARS.RelKind.CONTAINS,
    target: listenerId,
  });

  // Add entry role for first track's listener node (not schedule tracks)
  if (isFirstTrack && !isScheduleTrack) {
    trackRoles.push({
      entityId: listenerId,
      role: 'entry_event',
    });
  }

  // For each exit path, compile its steps and wire listener → first step
  const out = { entities: nodeEntities, relations: trackRelations };
  for (let exitIdx = 0; exitIdx < track.exits.length; exitIdx++) {
    const exitSteps = track.exits[exitIdx];
    if (exitSteps.length === 0) continue;

    const exitStepIds: string[] = [];
    const exitStepKeys: string[] = [];
    for (let si = 0; si < exitSteps.length; si++) {
      const stepLabel = getStepLabel(exitSteps[si], si);
      exitStepIds.push(fCtx.globalLabelMap.get(stepLabel)!);
      exitStepKeys.push(`t${trackIdx}-e${exitIdx}-s${si}`);
    }

    compileStepList(exitSteps, exitStepIds, exitStepKeys, fCtx, out);

    trackRelations.push({
      source: listenerId,
      kind: EARS.RelKind.TRANSITIONS_TO,
      target: exitStepIds[0],
      info: { sourceHandle: `exit-${exitIdx}` },
    });
  }

  return { listenerEntity, trackRoles };
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
    case 'kill': return `Kill Flow ${index}`;
    default: return `Step ${index}`;
  }
}

function compileStep(step: DSLStepNode, stepId: string, ts: number, ctx: CompilerContext): StepResult {
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
    case 'kill':
      return compileKillNode(step, stepId, ts);
  }
}

export default compile;
