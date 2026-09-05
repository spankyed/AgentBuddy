/**
 * Flow DSL Validator
 *
 * Validates track-based DSL documents before compilation.
 */

import type {
  FlowConfig,
  Track,
  ValidationError,
  ValidationResult,
} from './types';
import { isFlowConfig, resolveTracks } from './types';
import { Cron } from 'croner';
import { stepRegistry } from '@abuddy/sdk/steps';
import { registerStandardSteps } from '@/steps/register';

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
  registerStandardSteps();
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

  // Validate trigger field: exactly one of event or schedule
  const hasEvent = typeof t.event === 'string' && t.event.length > 0;
  const hasSchedule = typeof t.schedule === 'string' && (t.schedule as string).length > 0;

  if (!hasEvent && !hasSchedule) {
    errors.push({ path, message: 'Track must have an "event" string or a "schedule" cron expression' });
  }
  if (hasEvent && hasSchedule) {
    errors.push({ path, message: 'Track cannot have both "event" and "schedule"' });
  }
  if (hasSchedule) {
    const cronParts = (t.schedule as string).trim().split(/\s+/);
    if (cronParts.length < 5 || cronParts.length > 6) {
      errors.push({ path: `${path}.schedule`, message: 'Schedule must be a 5 or 6 field cron expression' });
    } else {
      try {
        new Cron(t.schedule as string);
      } catch {
        errors.push({ path: `${path}.schedule`, message: 'Invalid cron expression' });
      }
    }
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

  // Disallow trigger types in steps (they are implicit in track fields)
  if (s.type === 'listener' || stepRegistry.isTrigger(s.type as string)) {
    errors.push({ path, message: `Steps cannot have type "${s.type}". Trigger types belong at the track level.` });
    return errors;
  }

  const registeredTypes = stepRegistry.types();
  if (!registeredTypes.includes(s.type as string)) {
    errors.push({
      path,
      message: `Invalid step type: "${s.type}". Must be one of: ${registeredTypes.join(', ')}`,
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

  // Registry-based per-type validation
  const build = stepRegistry.getBuild(s.type as string);
  if (build) {
    const stepCtx = {
      actions: ctx.actions,
      prompts: ctx.prompts,
      flowNames: ctx.flowNames,
      nodeLabels: ctx.nodeLabels,
      path,
      skipReferenceCheck: options.skipReferenceCheck,
    };
    errors.push(...build.validate(s, path, stepCtx));
  }

  // Recurse into inline steps for switch-type nodes
  if (s.type === 'switch') {
    if (Array.isArray(s.conditions)) {
      for (let i = 0; i < (s.conditions as any[]).length; i++) {
        const cond = (s.conditions as any[])[i];
        if (Array.isArray(cond?.steps)) {
          for (let si = 0; si < cond.steps.length; si++) {
            errors.push(...validateStep(cond.steps[si], `${path}.conditions[${i}].steps[${si}]`, ctx, options));
          }
        }
      }
    }
    if (Array.isArray(s.else)) {
      for (let si = 0; si < (s.else as any[]).length; si++) {
        errors.push(...validateStep((s.else as any[])[si], `${path}.else[${si}]`, ctx, options));
      }
    }
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
  if (typeof track.schedule === 'string') return `Schedule ${index}`;
  return `Track ${index}`;
}

function getStepLabel(step: Record<string, unknown>, index: number): string {
  if (typeof step.label === 'string') return step.label;
  const build = stepRegistry.getBuild(step.type as string);
  if (build) return build.getLabel(step, index);
  return `Step ${index}`;
}

export default validate;
