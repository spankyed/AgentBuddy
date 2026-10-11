import type { StepFEFacet } from '@apack/sdk/steps';
import { defineAsyncComponent } from 'vue';
import { Zap } from 'lucide-vue-next';

export const fireStepFE: StepFEFacet = {
  loadComponents: () => ({ form: defineAsyncComponent(() => import('./form.vue')) }),
  colorKey: 'amber',
  nodeConfig: {
    icon: Zap,
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
