// A trigger owns a DSL *track* rather than a node in one, so its build-time facet is a `TriggerFacet`.
// Its track field is `pulse`, which is neither `event` nor `schedule` — the two the shipped pack declares —
// so this is what holds the generated track builder to working for a field the SDK cannot know in advance.
import type { TriggerFacet, StepNodeFacet } from '@apack/sdk/steps';
import { EARS } from '#generated/ears.ts';

export const pulseTriggerBuild: TriggerFacet = {
  trackField: 'pulse',

  compile(track, trackId, ts, trackKey) {
    return {
      id: trackId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'pulse',
      label: typeof track.label === 'string' ? track.label : 'Pulse',
      trackKey,
      interval: track.pulse,
    };
  },

  decompile(node) {
    return { pulse: (node as { interval?: unknown }).interval };
  },

  persistent: true,
  queryFields: ['interval'],

  // Checked when the node is written, so the defaults below have to satisfy it: adding the trigger to a
  // flow creates a node from them and nothing else
  validate(node) {
    const interval = (node as { interval?: unknown }).interval;
    if (typeof interval !== 'string' || interval.trim().length === 0) {
      return { valid: false, errors: ['Missing required field: interval'] };
    }
    return { valid: true, errors: [] };
  },
};

export const pulseTriggerNode: StepNodeFacet = {
  label: 'Pulse',
  defaultLabel: 'On pulse',
  defaults: { interval: '5m' },
};
