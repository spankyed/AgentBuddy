import type { TriggerFacet, StepNodeFacet } from '@abuddy/sdk/steps';
import { EARS } from '@abuddy/sdk';

/** Build-time facets only (no runtime or FE imports); loaded by `abuddy build` in dependent packs. */
export const listenerTriggerBuild: TriggerFacet = {
  trackField: 'event',
  compile(track, trackId, ts, trackKey) {
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
  },
  decompile(node) {
    const n = node as Record<string, unknown>;
    return { event: (n.eventType || n.label || 'unknown') as string };
  },
  persistent: false,
  queryFields: ['eventType', 'scope'],
};

/** What a node of this type starts with; the backend writes it and the canvas draws it */
export const listenerTriggerNode: StepNodeFacet = {
  label: 'Listener',
  defaultLabel: 'On event',
  defaults: { scope: 'global', eventType: '' },
};
