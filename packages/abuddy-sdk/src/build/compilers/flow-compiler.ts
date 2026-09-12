/**
 * Flow DSL Compiler
 *
 * Transforms track-based DSL format into EARS database format.
 * Each track creates a trigger node + sequential step nodes.
 * Branching is handled generically via StepBuildFacet.branches().
 */

import type { FlowDSL, Track, DSLStepNode } from './flow-types';
import { isFlowConfig, resolveTracks, ROOT_FLOW_ROLE } from './flow-types';
import type { CompilerContext } from './flow-entities';
import { stepRegistry, type StepDefinition } from '../../steps';

export type { CompilerContext };

export interface FlowEARS {
  Entity: Record<string, any>;
  RelKind: Record<string, any>;
}

type Relation = { source: string; kind: string; target: string; info?: object };

interface StepResult {
  entity: object;
  relations: Relation[];
}

interface FlowCompileCtx {
  flowId: string;
  flowName: string;
  ts: number;
  ctx: CompilerContext;
  ears: FlowEARS;
  globalLabelMap: Map<string, string>;
  inlineStepIds: Map<string, string>;
}

export interface CompiledRows {
  entity: object[];
  relation: Relation[];
  role: Array<{ entityId: string; role: string }>;
}

interface CompileOptions {
  actions?: Map<string, string>;
  prompts?: Map<string, string>;
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
 * Inline Branch Helpers (generic via StepBuildFacet.branches)
 *─────────────────────────────────────────────────────────────────*/

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

    registerBranchStepIds(step, flowName, key, globalLabelMap, inlineStepIds);
  }
}

function registerBranchStepIds(
  step: DSLStepNode,
  flowName: string,
  pathPrefix: string,
  globalLabelMap: Map<string, string>,
  inlineStepIds: Map<string, string>,
): void {
  const build = stepRegistry.getBuild(step.type);
  const branchList = build?.branches?.(step as Record<string, unknown>);
  if (!branchList?.length) return;

  for (const branch of branchList) {
    registerInlineSteps(branch.steps as DSLStepNode[], flowName, `${pathPrefix}-${branch.key}`, globalLabelMap, inlineStepIds);
  }
}

/*─────────────────────────────────────────────────────────────────
 * Unified Step List Compiler
 *─────────────────────────────────────────────────────────────────*/

function compileStepList(
  steps: DSLStepNode[],
  stepIds: string[],
  stepKeys: string[],
  fCtx: FlowCompileCtx,
  out: { entities: object[]; relations: Relation[] },
  continuationId?: string,
): void {
  for (let si = 0; si < steps.length; si++) {
    const step = steps[si];
    const stepId = stepIds[si];

    const { entity, relations } = compileStep(step, stepId, fCtx.ts, fCtx.ctx);
    out.entities.push(entity);
    out.relations.push(...relations);

    out.relations.push({
      source: fCtx.flowId,
      kind: fCtx.ears.RelKind.CONTAINS,
      target: stepId,
    });
  }

  for (let si = 0; si < steps.length; si++) {
    const step = steps[si];
    const stepId = stepIds[si];

    const build = stepRegistry.getBuild(step.type);
    const branchList = build?.branches?.(step as Record<string, unknown>);
    if (branchList?.length) {
      const switchContinuation = si < stepIds.length - 1 ? stepIds[si + 1] : continuationId;
      wireBranchEdges(step, branchList, stepId, stepKeys[si], fCtx, out, switchContinuation);
      continue;
    }

    if (step.next) {
      const targetId = fCtx.globalLabelMap.get(step.next as string);
      if (targetId) {
        out.relations.push({
          source: stepId,
          kind: fCtx.ears.RelKind.TRANSITIONS_TO,
          target: targetId,
        });
      }
      continue;
    }

    if (si < stepIds.length - 1) {
      out.relations.push({
        source: stepId,
        kind: fCtx.ears.RelKind.TRANSITIONS_TO,
        target: stepIds[si + 1],
      });
    } else if (continuationId) {
      out.relations.push({
        source: stepId,
        kind: fCtx.ears.RelKind.TRANSITIONS_TO,
        target: continuationId,
      });
    }
  }
}

function wireBranchEdges(
  _step: DSLStepNode,
  branchList: { key: string; steps: Record<string, unknown>[] }[],
  stepId: string,
  stepKey: string,
  fCtx: FlowCompileCtx,
  out: { entities: object[]; relations: Relation[] },
  continuationId?: string,
): void {
  for (let bi = 0; bi < branchList.length; bi++) {
    const branch = branchList[bi];
    if (!branch.steps.length) continue;

    const branchPrefix = `${stepKey}-${branch.key}`;
    const firstInlineId = fCtx.inlineStepIds.get(`${branchPrefix}-i0`)!;

    out.relations.push({
      source: stepId,
      kind: fCtx.ears.RelKind.TRANSITIONS_TO,
      target: firstInlineId,
      info: { sourceHandle: `branch-${bi}` },
    });

    const inlineIds = branch.steps.map((_, si) => fCtx.inlineStepIds.get(`${branchPrefix}-i${si}`)!);
    const inlineKeys = branch.steps.map((_, si) => `${branchPrefix}-i${si}`);
    compileStepList(branch.steps as DSLStepNode[], inlineIds, inlineKeys, fCtx, out, continuationId);
  }
}

/*─────────────────────────────────────────────────────────────────
 * Main Compiler
 *─────────────────────────────────────────────────────────────────*/

export function compile(dsl: FlowDSL, ears: FlowEARS, options: CompileOptions = {}): CompiledRows {
  const ts = Date.now();

  const entities: object[] = [];
  const relations: Relation[] = [];
  const roles: Array<{ entityId: string; role: string }> = [];

  const ctx: CompilerContext = {
    actions: options.actions || new Map(),
    prompts: options.prompts || new Map(),
    flows: new Map(),
  };

  for (const flowName of Object.keys(dsl)) {
    const flowId = generateId('Flow', flowName);
    ctx.flows.set(flowName, flowId);
  }

  for (const [flowName, entry] of Object.entries(dsl)) {
    const tracks = resolveTracks(entry);
    const flowId = ctx.flows.get(flowName)!;
    const { flowEntity, nodeEntities, flowRelations, flowRoles } = compileFlow(
      flowName,
      tracks,
      flowId,
      ts,
      ctx,
      ears
    );

    const sourceHash = isFlowConfig(entry) ? entry.sourceHash : undefined;
    entities.push(sourceHash ? { ...flowEntity, sourceHash } : flowEntity);
    entities.push(...nodeEntities);
    relations.push(...flowRelations);
    roles.push(...flowRoles);

    if (isFlowConfig(entry) && entry.root) {
      roles.push({ entityId: flowId, role: ROOT_FLOW_ROLE });
    }
  }

  return { entity: entities, relation: relations, role: roles };
}

function compileFlow(
  flowName: string,
  tracks: Track[],
  flowId: string,
  ts: number,
  ctx: CompilerContext,
  ears: FlowEARS,
): {
  flowEntity: object;
  nodeEntities: object[];
  flowRelations: Relation[];
  flowRoles: Array<{ entityId: string; role: string }>;
} {
  const shortCode = `F-${flowName.slice(0, 8).replace(/\s/g, '')}`;

  const flowEntity = {
    id: flowId,
    entityType: ears.Entity.Flow,
    shortCode,
    label: flowName,
    flowType: 'workflow',
    createdAt: ts,
  };

  const nodeEntities: object[] = [];
  const flowRelations: Relation[] = [];
  const flowRoles: Array<{ entityId: string; role: string }> = [];

  const globalLabelMap = new Map<string, string>();
  const inlineStepIds = new Map<string, string>();

  for (let trackIdx = 0; trackIdx < tracks.length; trackIdx++) {
    const track = tracks[trackIdx];
    const listenerLabel = resolveTrackLabel(track, trackIdx);
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

        registerBranchStepIds(step, flowName, `t${trackIdx}-e${exitIdx}-s${stepIdx}`, globalLabelMap, inlineStepIds);
      }
    }
  }

  const fCtx: FlowCompileCtx = { flowId, flowName, ts, ctx, ears, globalLabelMap, inlineStepIds };

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

function resolveTrackLabel(track: Track, trackIdx: number): string {
  if (track.label) return track.label;
  if (track.event) return track.event;
  const triggerDef = resolveTriggerFromTrack(track);
  const prefix = triggerDef?.fe?.nodeConfig?.label || triggerDef?.type || 'Trigger';
  return `${prefix} ${trackIdx}`;
}

function resolveTriggerFromTrack(track: Track): StepDefinition | null {
  for (const def of stepRegistry.triggers()) {
    if (def.trigger?.trackField && (track as any)[def.trigger.trackField] !== undefined) {
      return def;
    }
  }
  return null;
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

  const triggerDef = resolveTriggerFromTrack(track);
  if (!triggerDef?.trigger) {
    const knownFields = stepRegistry.triggers().map(d => `"${d.trigger!.trackField}"`).join(', ');
    throw new Error(`No trigger definition found for track ${trackIdx} in flow "${fCtx.flowName}". Track must have a recognized trigger field (${knownFields}).`);
  }
  const listenerLabel = resolveTrackLabel(track, trackIdx);
  const listenerId = fCtx.globalLabelMap.get(listenerLabel)!;
  const trackKey = `${fCtx.flowName}:track:${trackIdx}`;

  const trackData = { ...track, isFirstTrack } as unknown as Record<string, unknown>;
  const listenerEntity = triggerDef.trigger.compile(trackData, listenerId, fCtx.ts, trackKey);

  trackRelations.push({
    source: fCtx.flowId,
    kind: fCtx.ears.RelKind.CONTAINS,
    target: listenerId,
  });

  if (isFirstTrack && triggerDef?.type === 'listener') {
    trackRoles.push({ entityId: listenerId, role: 'entry_event' });
  }

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
      kind: fCtx.ears.RelKind.TRANSITIONS_TO,
      target: exitStepIds[0],
      info: { sourceHandle: `exit-${exitIdx}` },
    });
  }

  return { listenerEntity, trackRoles };
}

function getStepLabel(step: DSLStepNode, index: number): string {
  if (step.label) return step.label;
  const build = stepRegistry.getBuild(step.type);
  if (build) return build.getLabel(step as unknown as Record<string, unknown>, index);
  return `Step ${index}`;
}

function compileStep(step: DSLStepNode, stepId: string, ts: number, ctx: CompilerContext): StepResult {
  const build = stepRegistry.getBuild(step.type);
  if (!build) throw new Error(`No step definition registered for type "${step.type}"`);
  return build.compile(step as unknown as Record<string, unknown>, stepId, ts, ctx) as StepResult;
}

export default compile;
