import type { TriggerFacet } from '@apackdev/sdk/steps';
import { EARS } from '@apackdev/sdk';

export const compile: TriggerFacet['compile'] = (track, trackId, ts, trackKey) => {
  const t = track as Record<string, unknown>;
  return {
    id: trackId,
    entityType: EARS.Entity.Node,
    createdAt: ts,
    nodeType: 'listener',
    label: t.label || t.event || 'Listener',
    description: t.description,
    trackKey,
    scope: t.isFirstTrack ? 'entry' : 'global',
    eventType: t.event,
  };
};

export const decompile: TriggerFacet['decompile'] = (node) => {
  const n = node as Record<string, unknown>;
  return { event: (n.eventType || n.label || 'unknown') as string };
};
