import type { StepFEFacet } from '@abuddy/sdk/steps';
import { defineAsyncComponent } from 'vue';
import { Plus } from 'lucide-vue-next';

export const createStepFE: StepFEFacet = {
  loadComponents: () => ({ form: defineAsyncComponent(() => import('./form.vue')) }),
  colorKey: 'purple',
  nodeConfig: {
    icon: Plus,
    connectionRules: { inputs: 1, outputs: 1 },
    category: 'data',
    isImplemented: true,
  },
};
