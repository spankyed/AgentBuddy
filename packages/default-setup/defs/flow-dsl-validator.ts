/**
 * Flow DSL Validator – Vendored from AgentBuddy
 * Source: packages/api/src/systems/flows/dsl/validator.ts
 *
 * Validates track-based DSL documents before compilation.
 */

import type {
  FlowDSL,
  FlowConfig,
  Track,
  DSLStepNode,
  ValidationError,
  ValidationResult,
} from './flow-dsl-types';
import { isFlowConfig, resolveTracks } from './flow-dsl-types';

// Step node types (excludes 'listener' - that's implicit in track.event)
const STEP_TYPES = [
  'action',
  'llm',
  'switch',
  'fire',
  'transform',
  'query',
  'flow',
  'create',
  'update',
  'keep_alive',
] as const;

type StepType = typeof STEP_TYPES[number];

/*─────────────────────────────────────────────────────────────────
 * Validation Context
 *─────────────────────────────────────────────────────────────────*/

interface ValidationContext {
  /** Available action labels */
  actions: Set<string>;
  /** Available prompt labels */
  prompts: Set<string>;
  /** Flow names being defined in this DSL */
  flowNames: Set<string>;
  /** All node labels within current flow (track labels + step labels) */
  nodeLabels: Set<string>;
  /** Current path for error reporting */
  path: string;
}

/*─────────────────────────────────────────────────────────────────
 * Main Validator
 *─────────────────────────────────────────────────────────────────*/

interface ValidateOptions {
  /** Available action labels */
  actions?: string[];
  /** Available prompt labels */
  prompts?: string[];
  /** Skip reference validation (useful for standalone validation) */
  skipReferenceCheck?: boolean;
}

/**
 * Validate a Flow DSL document (track-based format)
 */
export function validate(dsl: unknown, options: ValidateOptions = {}): ValidationResult {
  const errors: ValidationError[] = [];

  // Basic structure check - should be a non-null object
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

  // Create context
  const ctx: ValidationContext = {
    actions: new Set(options.actions || []),
    prompts: new Set(options.prompts || []),
    flowNames,
    nodeLabels: new Set(),
    path: '',
  };

  // Validate root flag: at most one flow may be root
  const rootFlows: string[] = [];
  for (const [flowName, entry] of Object.entries(flows)) {
    if (isFlowConfig(entry as Track[] | FlowConfig) && (entry as FlowConfig).root) {
      rootFlows.push(flowName);
    }
  }
  if (rootFlows.length > 1) {
    errors.push({ path: '', message: `Multiple flows marked as root: ${rootFlows.join(', ')}. At most one flow can be root.` });
  }

  // Validate each flow
  for (const [flowName, entry] of Object.entries(flows)) {
    ctx.path = flowName;
    ctx.nodeLabels = new Set();

    // Normalize: unwrap FlowConfig to get tracks
    const tracks = resolveTracks(entry as Track[] | FlowConfig);

    const flowErrors = validateFlow(flowName, tracks, ctx, options);
    errors.push(...flowErrors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/*─────────────────────────────────────────────────────────────────
 * Flow Validation
 *─────────────────────────────────────────────────────────────────*/

function validateFlow(
  flowName: string,
  tracks: unknown,
  ctx: ValidationContext,
  options: ValidateOptions
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Flow value must be an array of tracks
  if (!Array.isArray(tracks)) {
    errors.push({ path: ctx.path, message: 'Flow must be an array of tracks' });
    return errors;
  }

  if (tracks.length === 0) {
    errors.push({ path: ctx.path, message: 'Flow must have at least one track' });
    return errors;
  }

  // First pass: collect all labels (track labels + step labels)
  const nodeLabels = new Set<string>();
  for (let trackIdx = 0; trackIdx < tracks.length; trackIdx++) {
    const track = tracks[trackIdx] as Record<string, unknown>;
    if (!track || typeof track !== 'object') continue;

    // Track label (from label or event)
    const trackLabel = getTrackLabel(track, trackIdx);
    if (nodeLabels.has(trackLabel)) {
      errors.push({
        path: `${ctx.path}[${trackIdx}]`,
        message: `Duplicate label: "${trackLabel}"`,
      });
    }
    nodeLabels.add(trackLabel);

    // Step labels from all exits (including inline switch branch steps)
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

  // Validate each track
  for (let trackIdx = 0; trackIdx < tracks.length; trackIdx++) {
    const trackPath = `${ctx.path}[${trackIdx}]`;
    const trackErrors = validateTrack(tracks[trackIdx], trackPath, ctx, options);
    errors.push(...trackErrors);
  }

  return errors;
}

/*─────────────────────────────────────────────────────────────────
 * Track Validation
 *─────────────────────────────────────────────────────────────────*/

function validateTrack(
  track: unknown,
  path: string,
  ctx: ValidationContext,
  options: ValidateOptions
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!track || typeof track !== 'object' || Array.isArray(track)) {
    errors.push({ path, message: 'Track must be an object with "event" and "exits"' });
    return errors;
  }

  const t = track as Record<string, unknown>;

  // Validate event field (required)
  if (!t.event || typeof t.event !== 'string') {
    errors.push({ path, message: 'Track must have an "event" string' });
  }

  // Validate exits array (required, at least one exit path)
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

/*─────────────────────────────────────────────────────────────────
 * Step Validation
 *─────────────────────────────────────────────────────────────────*/

function validateStep(
  step: unknown,
  path: string,
  ctx: ValidationContext,
  options: ValidateOptions
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!step || typeof step !== 'object' || Array.isArray(step)) {
    errors.push({ path, message: 'Step must be an object' });
    return errors;
  }

  const s = step as Record<string, unknown>;

  // Check type field
  if (!s.type) {
    errors.push({ path, message: 'Step must have a "type" field' });
    return errors;
  }

  // Disallow 'listener' type in steps (listener is implicit in track.event)
  if (s.type === 'listener') {
    errors.push({
      path,
      message: 'Steps cannot have type "listener". Use track.event instead.',
    });
    return errors;
  }

  if (!STEP_TYPES.includes(s.type as StepType)) {
    errors.push({
      path,
      message: `Invalid step type: "${s.type}". Must be one of: ${STEP_TYPES.join(', ')}`,
    });
    return errors;
  }

  // Validate 'next' reference if present
  if (s.next && typeof s.next === 'string') {
    if (!ctx.nodeLabels.has(s.next)) {
      errors.push({
        path: `${path}.next`,
        message: `Referenced node "${s.next}" not found in this flow`,
      });
    }
  }

  // Type-specific validation
  switch (s.type as StepType) {
    case 'action':
      errors.push(...validateActionStep(s, path, ctx, options));
      break;
    case 'llm':
      errors.push(...validateLLMStep(s, path, ctx, options));
      break;
    case 'switch':
      errors.push(...validateSwitchStep(s, path, ctx, options));
      break;
    case 'fire':
      errors.push(...validateFireStep(s, path));
      break;
    case 'transform':
      errors.push(...validateTransformStep(s, path));
      break;
    case 'query':
      errors.push(...validateQueryStep(s, path));
      break;
    case 'flow':
      errors.push(...validateFlowStep(s, path, ctx));
      break;
    case 'create':
      errors.push(...validateCreateStep(s, path));
      break;
    case 'update':
      errors.push(...validateUpdateStep(s, path, ctx));
      break;
    case 'keep_alive':
      // No specific validation needed
      break;
  }

  return errors;
}

function validateActionStep(
  s: Record<string, unknown>,
  path: string,
  ctx: ValidationContext,
  options: ValidateOptions
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!s.action || typeof s.action !== 'string') {
    errors.push({ path, message: 'Action step must have an "action" string (action name)' });
  } else if (!options.skipReferenceCheck && !ctx.actions.has(s.action)) {
    errors.push({
      path: `${path}.action`,
      message: `Action "${s.action}" not found. Available: ${Array.from(ctx.actions).join(', ') || '(none)'}`,
    });
  }

  if (s.map !== undefined && (typeof s.map !== 'object' || s.map === null || Array.isArray(s.map))) {
    errors.push({ path: `${path}.map`, message: '"map" must be an object { target: source }' });
  }

  return errors;
}

function validateLLMStep(
  s: Record<string, unknown>,
  path: string,
  ctx: ValidationContext,
  options: ValidateOptions
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!s.prompt || typeof s.prompt !== 'string') {
    errors.push({ path, message: 'LLM step must have a "prompt" string (prompt template name)' });
  } else if (!options.skipReferenceCheck && !ctx.prompts.has(s.prompt)) {
    errors.push({
      path: `${path}.prompt`,
      message: `Prompt "${s.prompt}" not found. Available: ${Array.from(ctx.prompts).join(', ') || '(none)'}`,
    });
  }

  if (s.map !== undefined && (typeof s.map !== 'object' || s.map === null || Array.isArray(s.map))) {
    errors.push({ path: `${path}.map`, message: '"map" must be an object { target: source }' });
  }

  return errors;
}

function validateSwitchStep(
  s: Record<string, unknown>,
  path: string,
  ctx: ValidationContext,
  options: ValidateOptions
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!Array.isArray(s.conditions)) {
    errors.push({ path, message: 'Switch step must have a "conditions" array' });
    return errors;
  }

  if (s.conditions.length === 0) {
    errors.push({ path: `${path}.conditions`, message: 'Switch must have at least one condition' });
  }

  for (let i = 0; i < s.conditions.length; i++) {
    const cond = s.conditions[i] as Record<string, unknown>;
    const condPath = `${path}.conditions[${i}]`;

    if (!cond.if || typeof cond.if !== 'string') {
      errors.push({ path: condPath, message: 'Condition must have an "if" expression string' });
    }

    if (!Array.isArray(cond.steps)) {
      errors.push({ path: `${condPath}.steps`, message: 'Condition must have a "steps" array' });
    } else if (cond.steps.length === 0) {
      errors.push({ path: `${condPath}.steps`, message: 'Steps array must not be empty' });
    } else {
      for (let si = 0; si < cond.steps.length; si++) {
        errors.push(...validateStep(cond.steps[si], `${condPath}.steps[${si}]`, ctx, options));
      }
    }
  }

  if (s.else !== undefined) {
    if (!Array.isArray(s.else)) {
      errors.push({ path: `${path}.else`, message: '"else" must be an array of steps' });
    } else if (s.else.length === 0) {
      errors.push({ path: `${path}.else`, message: 'Else steps array must not be empty' });
    } else {
      for (let si = 0; si < s.else.length; si++) {
        errors.push(...validateStep(s.else[si], `${path}.else[${si}]`, ctx, options));
      }
    }
  }

  return errors;
}

function validateFireStep(s: Record<string, unknown>, path: string): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!s.event || typeof s.event !== 'string') {
    errors.push({ path, message: 'Fire step must have an "event" string' });
  }

  if (s.scope !== undefined && !['local', 'global'].includes(s.scope as string)) {
    errors.push({ path: `${path}.scope`, message: '"scope" must be "local" or "global"' });
  }

  return errors;
}

function validateTransformStep(s: Record<string, unknown>, path: string): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!s.script || typeof s.script !== 'string') {
    errors.push({ path, message: 'Transform step must have a "script" string' });
  }

  if (s.outputType !== undefined && !['json', 'text', 'custom'].includes(s.outputType as string)) {
    errors.push({ path: `${path}.outputType`, message: '"outputType" must be "json", "text", or "custom"' });
  }

  return errors;
}

function validateQueryStep(s: Record<string, unknown>, path: string): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!s.prompt || typeof s.prompt !== 'string') {
    errors.push({ path, message: 'Query step must have a "prompt" string' });
  }

  return errors;
}

function validateFlowStep(
  s: Record<string, unknown>,
  path: string,
  ctx: ValidationContext
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!s.flow || typeof s.flow !== 'string') {
    errors.push({ path, message: 'Flow step must have a "flow" string (sub-flow name)' });
  }
  // Note: Sub-flow might reference flows outside this DSL, so we don't validate flowNames

  return errors;
}

function validateCreateStep(s: Record<string, unknown>, path: string): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!s.entity || typeof s.entity !== 'string') {
    errors.push({ path, message: 'Create step must have an "entity" string (entity type)' });
  }

  return errors;
}

function validateUpdateStep(
  s: Record<string, unknown>,
  path: string,
  ctx: ValidationContext
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!s.target || typeof s.target !== 'string') {
    errors.push({ path, message: 'Update step must have a "target" string (label of create node)' });
  } else if (!ctx.nodeLabels.has(s.target)) {
    errors.push({
      path: `${path}.target`,
      message: `Referenced create node "${s.target}" not found in this flow`,
    });
  }

  if (s.onMissing !== undefined && !['fail', 'ignore', 'create'].includes(s.onMissing as string)) {
    errors.push({ path: `${path}.onMissing`, message: '"onMissing" must be "fail", "ignore", or "create"' });
  }

  return errors;
}

/*─────────────────────────────────────────────────────────────────
 * Helpers
 *─────────────────────────────────────────────────────────────────*/

/**
 * Recursively collect step labels, including inline steps inside switch conditions.
 */
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
      errors.push({
        path: `${basePath}[${stepIdx}]`,
        message: `Duplicate label: "${stepLabel}"`,
      });
    }
    nodeLabels.add(stepLabel);

    // Recurse into inline switch branch steps
    if (step.type === 'switch' && Array.isArray(step.conditions)) {
      for (let ci = 0; ci < (step.conditions as any[]).length; ci++) {
        const cond = (step.conditions as any[])[ci];
        if (cond && Array.isArray(cond.steps)) {
          collectStepLabels(
            cond.steps, nodeLabels, errors,
            `${basePath}[${stepIdx}].conditions[${ci}].steps`
          );
        }
      }
      if (Array.isArray(step.else)) {
        collectStepLabels(
          step.else as unknown[], nodeLabels, errors,
          `${basePath}[${stepIdx}].else`
        );
      }
    }
  }
}

function getTrackLabel(track: Record<string, unknown>, index: number): string {
  if (typeof track.label === 'string') return track.label;
  if (typeof track.event === 'string') return track.event;
  return `Track ${index}`;
}

function getStepLabel(step: Record<string, unknown>, index: number): string {
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
    default: return `Step ${index}`;
  }
}

export default validate;
