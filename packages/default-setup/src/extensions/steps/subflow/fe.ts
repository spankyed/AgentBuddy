import type { StepFEFacet } from '@abuddy/sdk/steps';
import { defineAsyncComponent } from 'vue';
import { Workflow } from 'lucide-vue-next';

export const flowStepFE: StepFEFacet = {
  loadComponents: () => ({ form: defineAsyncComponent(() => import('./form.vue')) }),
  colorKey: 'purple',
  nodeConfig: {
    icon: Workflow,
    connectionRules: { inputs: 1, outputs: 1 },
    category: 'logic',
    isImplemented: true,
  },
};
