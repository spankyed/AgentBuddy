import type { StepDefinition } from '@abuddy/sdk/steps';
import { defineAsyncComponent } from 'vue';
import { Zap } from 'lucide-vue-next';

export const fireStepFE: StepDefinition = {
  type: 'fire',
  fe: {
    loadComponents: () => ({ form: defineAsyncComponent(() => import('./form.vue')) }),
    colorKey: 'amber',
    nodeConfig: {
      label: 'Fire',
      defaultLabel: 'Fire event',
      icon: Zap,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      hoverBgColor: 'group-hover:bg-amber-500/15',
      connectionRules: { inputs: 1, outputs: 0 },
      component: 'FireNode',
      category: 'action',
      isImplemented: true,
    },
    defaults: { scope: 'local' },
    layout: {
      getPorts: (node) => [
        { id: `${node.id}-in`, layoutOptions: { 'port.side': 'WEST' } },
      ],
      hasInput: true,
    },
  },
};
