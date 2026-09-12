import type { StepDefinition } from '@abuddy/sdk/steps';
import { EARS } from '@abuddy/sdk';

/** Build-time facets only (no runtime or FE imports); loaded by `abuddy build` in dependent packs. */
export const listenerTriggerBuild: StepDefinition = {
  type: 'listener',
  kind: 'trigger',
  trigger: {
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
  },
};
