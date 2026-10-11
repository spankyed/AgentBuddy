import type { StepFEFacet } from '@apack/sdk/steps';
import { defineAsyncComponent } from 'vue';
import { RefreshCw } from 'lucide-vue-next';

export const updateStepFE: StepFEFacet = {
  loadComponents: () => ({ form: defineAsyncComponent(() => import('./form.vue')) }),
  colorKey: 'purple',
  nodeConfig: {
    icon: RefreshCw,
    connectionRules: { inputs: 1, outputs: 1 },
    category: 'data',
    isImplemented: true,
  },
};
