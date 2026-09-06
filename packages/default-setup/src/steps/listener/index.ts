import type { StepDefinition } from '@abuddy/sdk/steps';
import { EARS } from '@abuddy/sdk';
import { Radio } from 'lucide-vue-next';

export const listenerTrigger: StepDefinition = {
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
  fe: {
    loadComponents: () => ({ form: require('./form.vue').default }),
    nodeConfig: {
      label: 'Listener',
      defaultLabel: 'On event',
      icon: Radio,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      hoverBgColor: 'group-hover:bg-blue-500/15',
      connectionRules: { inputs: 0, outputs: -1 },
      category: 'trigger',
      isImplemented: true,
    },
    colorKey: 'blue',
    defaults: { scope: 'global', eventType: '' },
  },
};
