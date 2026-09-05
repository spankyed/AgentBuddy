import type {
  FlowConfig,
  Track,
  ValidationError,
  ValidationResult,
} from './flow-types';
import { isFlowConfig, resolveTracks } from './flow-types';
import { validateCronExpression } from '../cron-utils';
import { stepRegistry } from '../../steps/registry';
import type { StepValidationContext } from '../../steps/types';

const FALLBACK_STEP_TYPES = [
  'action', 'llm', 'switch', 'fire', 'transform',
  'query', 'flow', 'create', 'update', 'keep_alive', 'kill',
] as const;

interface ValidationContext {
  actions: Set<string>;
  prompts: Set<string>;
  flowNames: Set<string>;
  nodeLabels: Set<string>;
  path: string;
}

interface ValidateOptions {
  actions?: string[];
  prompts?: string[];
  skipReferenceCheck?: boolean;
  stepTypes?: string[];
}

export function validate(dsl: unknown, options: ValidateOptions = {}): ValidationResult {
  const errors: ValidationError[] = [];

  if (!dsl || typeof dsl !== 'object' || Array.isArray(dsl)) {
    return {
      valid: false,
      errors: [{ path: '', message: 'DSL must be an object mapping flow names to track arrays' }],
    };
  }

  const flows = dsl as Record<string, unknown>;
  const flowNames = new Set(Object.keys(flows));

  if (flowNames.size === 0) {
    errors.push({ path: '', message: 'At least one flow must be defined' });
  }

  const ctx: ValidationContext = {
    actions: new Set(options.actions || []),
    prompts: new Set(options.prompts || []),
    flowNames,
    nodeLabels: new Set(),
    path: '',
  };

  const rootFlows: string[] = [];
  for (const [flowName, entry] of Object.entries(flows)) {
    if (isFlowConfig(entry as Track[] | FlowConfig) && (entry as FlowConfig).root) {
      rootFlows.push(flowName);
    }
  }
  if (rootFlows.length > 1) {
    errors.push({ path: '', message: `Multiple flows marked as root: ${rootFlows.join(', ')}. At most one flow can be root.` });
  }

  for (const [flowName, entry] of Object.entries(flows)) {
    ctx.path = flowName;
    ctx.nodeLabels = new Set();
    const tracks = resolveTracks(entry as Track[] | FlowConfig);
    const flowErrors = validateFlow(flowName, tracks, ctx, options);
    errors.push(...flowErrors);
  }

  return { valid: errors.length === 0, errors };
}

function validateFlow(
  _flowName: string,
  tracks: unknown,
  ctx: ValidationContext,
  options: ValidateOptions,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!Array.isArray(tracks)) {
    errors.push({ path: ctx.path, message: 'Flow must be an array of tracks' });
    return errors;
  }

  if (tracks.length === 0) {
    errors.push({ path: ctx.path, message: 'Flow must have at least one track' });
    return errors;
  }

  const nodeLabels = new Set<string>();
  for (let trackIdx = 0; trackIdx < tracks.length; trackIdx++) {
    const track = tracks[trackIdx] as Record<string, unknown>;
    if (!track || typeof track !== 'object') continue;

    const trackLabel = getTrackLabel(track, trackIdx);
    if (nodeLabels.has(trackLabel)) {
      errors.push({ path: `${ctx.path}[${trackIdx}]`, message: `Duplicate label: "${trackLabel}"` });
    }
    nodeLabels.add(trackLabel);

    const exits = track.exits as unknown[];
    if (Array.isArray(exits)) {
      for (let exitIdx = 0; exitIdx < exits.length; exitIdx++) {
        const exitSteps = exits[exitIdx] as unknown[];
        if (Array.isArray(exitSteps)) {
          collectStepLabels(exitSteps, nodeLabels, errors, `${ctx.path}[${trackIdx}].exits[${exitIdx}]`);
        }
      }
    }
  }
  ctx.nodeLabels = nodeLabels;

  for (let trackIdx = 0; trackIdx < tracks.length; trackIdx++) {
    const trackPath = `${ctx.path}[${trackIdx}]`;
    errors.push(...validateTrack(tracks[trackIdx], trackPath, ctx, options));
  }

  return errors;
}

function validateTrack(
  track: unknown,
  path: string,
  ctx: ValidationContext,
  options: ValidateOptions,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!track || typeof track !== 'object' || Array.isArray(track)) {
    errors.push({ path, message: 'Track must be an object with "event" and "exits"' });
    return errors;
  }

  const t = track as Record<string, unknown>;
  const hasEvent = typeof t.event === 'string' && t.event.length > 0;
  const hasSchedule = typeof t.schedule === 'string' && (t.schedule as string).length > 0;

  if (!hasEvent && !hasSchedule) {
    errors.push({ path, message: 'Track must have an "event" string or a "schedule" cron expression' });
  }
  if (hasEvent && hasSchedule) {
    errors.push({ path, message: 'Track cannot have both "event" and "schedule"' });
  }
  if (hasSchedule) {
    const cronErr = validateCronExpression(t.schedule as string);
    if (cronErr) errors.push({ path: `${path}.schedule`, message: cronErr });
  }

  if (!Array.isArray(t.exits)) {
    errors.push({ path, message: 'Track must have an "exits" array' });
    return errors;
  } else if (t.exits.length === 0) {
    errors.push({ path: `${path}.exits`, message: 'Exits must have at least one path' });
  } else {
    for (let exitIdx = 0; exitIdx < t.exits.length; exitIdx++) {
      const exitPath = `${path}.exits[${exitIdx}]`;
      const exitSteps = t.exits[exitIdx];
      if (!Array.isArray(exitSteps)) {
        errors.push({ path: exitPath, message: 'Each exit must be a steps array' });
      } else {
        for (let si = 0; si < exitSteps.length; si++) {
          errors.push(...validateStep(exitSteps[si], `${exitPath}[${si}]`, ctx, options));
        }
      }
    }
  }

  return errors;
}

function getValidStepTypes(options: ValidateOptions): string[] {
  const types = new Set<string>(FALLBACK_STEP_TYPES);
  for (const t of stepRegistry.types()) types.add(t);
  if (options.stepTypes) {
    for (const t of options.stepTypes) types.add(t);
  }
  return [...types];
}

function validateStep(
  step: unknown,
  path: string,
  ctx: ValidationContext,
  options: ValidateOptions,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!step || typeof step !== 'object' || Array.isArray(step)) {
    errors.push({ path, message: 'Step must be an object' });
    return errors;
  }

  const s = step as Record<string, unknown>;

  if (!s.type) {
    errors.push({ path, message: 'Step must have a "type" field' });
    return errors;
  }

  if (s.type === 'listener' || stepRegistry.isTrigger(s.type as string)) {
    errors.push({ path, message: `Steps cannot have type "${s.type}". Trigger types belong at the track level.` });
    return errors;
  }

  const validTypes = getValidStepTypes(options);
  if (!validTypes.includes(s.type as string)) {
    errors.push({ path, message: `Invalid step type: "${s.type}". Must be one of: ${validTypes.join(', ')}` });
    return errors;
  }

  if (s.next && typeof s.next === 'string') {
    if (!ctx.nodeLabels.has(s.next)) {
      errors.push({ path: `${path}.next`, message: `Referenced node "${s.next}" not found in this flow` });
    }
  }

  const stepType = s.type as string;
  const buildFacet = stepRegistry.getBuild(stepType);

  if (buildFacet) {
    const stepCtx: StepValidationContext = {
      actions: ctx.actions,
      prompts: ctx.prompts,
      flowNames: ctx.flowNames,
      nodeLabels: ctx.nodeLabels,
      path,
      skipReferenceCheck: options.skipReferenceCheck,
    };
    errors.push(...buildFacet.validate(s, path, stepCtx));
  }

  if (stepType === 'switch') {
    if (Array.isArray(s.conditions)) {
      for (let i = 0; i < (s.conditions as any[]).length; i++) {
        const cond = (s.conditions as any[])[i] as Record<string, unknown>;
        if (cond && Array.isArray(cond.steps)) {
          const condPath = `${path}.conditions[${i}]`;
          for (let si = 0; si < (cond.steps as any[]).length; si++) {
            errors.push(...validateStep((cond.steps as any[])[si], `${condPath}.steps[${si}]`, ctx, options));
          }
        }
      }
      if (Array.isArray(s.else)) {
        for (let si = 0; si < (s.else as any[]).length; si++) {
          errors.push(...validateStep((s.else as any[])[si], `${path}.else[${si}]`, ctx, options));
        }
      }
    }
  }

  return errors;
}

function collectStepLabels(
  steps: unknown[],
  nodeLabels: Set<string>,
  errors: ValidationError[],
  basePath: string,
): void {
  for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
    const step = steps[stepIdx] as Record<string, unknown>;
    if (!step || typeof step !== 'object') continue;

    const stepLabel = getStepLabel(step, stepIdx);
    if (nodeLabels.has(stepLabel)) {
      errors.push({ path: `${basePath}[${stepIdx}]`, message: `Duplicate label: "${stepLabel}"` });
    }
    nodeLabels.add(stepLabel);

    if (step.type === 'switch' && Array.isArray(step.conditions)) {
      for (let ci = 0; ci < (step.conditions as any[]).length; ci++) {
        const cond = (step.conditions as any[])[ci];
        if (cond && Array.isArray(cond.steps)) {
          collectStepLabels(cond.steps, nodeLabels, errors, `${basePath}[${stepIdx}].conditions[${ci}].steps`);
        }
      }
      if (Array.isArray(step.else)) {
        collectStepLabels(step.else as unknown[], nodeLabels, errors, `${basePath}[${stepIdx}].else`);
      }
    }
  }
}

function getTrackLabel(track: Record<string, unknown>, index: number): string {
  if (typeof track.label === 'string') return track.label;
  if (typeof track.event === 'string') return track.event;
  if (typeof track.schedule === 'string') return `Schedule ${index}`;
  return `Track ${index}`;
}

function getStepLabel(step: Record<string, unknown>, index: number): string {
  const buildFacet = stepRegistry.getBuild(step.type as string);
  if (buildFacet) {
    return buildFacet.getLabel(step, index);
  }

  if (typeof step.label === 'string') return step.label;
  switch (step.type) {
    case 'action': return step.action as string || `Action ${index}`;
    case 'llm': return step.prompt as string || `LLM ${index}`;
    case 'fire': return step.event as string || `Fire ${index}`;
    case 'flow': return step.flow as string || `Flow ${index}`;
    case 'switch': return `Switch ${index}`;
    case 'transform': return `Transform ${index}`;
    case 'query': return `Query ${index}`;
    case 'create': return `Create ${step.entity || index}`;
    case 'update': return `Update ${index}`;
    case 'keep_alive': return `Keep Alive ${index}`;
    case 'kill': return `Kill Flow ${index}`;
    default: return `Step ${index}`;
  }
}
