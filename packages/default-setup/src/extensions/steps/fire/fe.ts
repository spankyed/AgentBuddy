import type { StepFEFacet } from '@abuddy/sdk/steps';
import { defineAsyncComponent } from 'vue';
import { Zap } from 'lucide-vue-next';

export const fireStepFE: StepFEFacet = {
  loadComponents: () => ({ form: defineAsyncComponent(() => import('./form.vue')) }),
  colorKey: 'amber',
  nodeConfig: {
    icon: Zap,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    hoverBgColor: 'group-hover:bg-amber-500/15',
    connectionRules: { inputs: 1, outputs: 0 },
    category: 'action',
    isImplemented: true,
  },
  layout: {
    getPorts: (node) => [
      { id: `${node.id}-in`, layoutOptions: { 'port.side': 'WEST' } },
    ],
    hasInput: true,
  },
};
