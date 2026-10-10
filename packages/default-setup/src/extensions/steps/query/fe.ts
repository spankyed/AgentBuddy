import type { StepFEFacet } from '@abuddy/sdk/steps';
import { defineAsyncComponent } from 'vue';
import { Search } from 'lucide-vue-next';

export const queryStepFE: StepFEFacet = {
  loadComponents: () => ({ form: defineAsyncComponent(() => import('./form.vue')) }),
  colorKey: 'cyan',
  nodeConfig: {
    icon: Search,
    connectionRules: { inputs: 1, outputs: 1 },
    category: 'data',
    isImplemented: true,
  },
};
