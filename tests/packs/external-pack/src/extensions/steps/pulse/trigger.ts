// A trigger owns a DSL *track* rather than a node in one, so its build-time facet is a `TriggerFacet`.
// Its track field is `pulse`, which is neither `event` nor `schedule` — the two the shipped pack declares —
// so this is what holds the generated track builder to working for a field the SDK cannot know in advance.
import type { TriggerFacet } from '@apackdev/sdk/steps';
import { EARS } from '#generated/ears.ts';

export const compile: TriggerFacet['compile'] = (track, trackId, ts, trackKey) => {
  return {
    id: trackId,
    entityType: EARS.Entity.Node,
    createdAt: ts,
    nodeType: 'pulse',
    label: typeof track.label === 'string' ? track.label : 'Pulse',
    trackKey,
    interval: track.pulse,
  };
};

export const decompile: TriggerFacet['decompile'] = (node) => {
  return { pulse: (node as {
      interval?: unknown;
    }).interval };
};

export const validate: NonNullable<TriggerFacet['validate']> = (node) => {
  const interval = (node as {
    interval?: unknown;
  }).interval;
  if (typeof interval !== 'string' || interval.trim().length === 0) {
    return { valid: false, errors: ['Missing required field: interval'] };
  }
  return { valid: true, errors: [] };
};
