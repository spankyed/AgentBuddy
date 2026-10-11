import type { StepFEFacet } from '@apack/sdk/steps';
import { defineAsyncComponent } from 'vue';
import { Shuffle } from 'lucide-vue-next';

export const transformStepFE: StepFEFacet = {
  loadComponents: () => ({ form: defineAsyncComponent(() => import('./form.vue')) }),
  colorKey: 'emerald',
  nodeConfig: {
    icon: Shuffle,
    connectionRules: { inputs: 1, outputs: 1 },
    category: 'data',
    isImplemented: true,
  },
};
