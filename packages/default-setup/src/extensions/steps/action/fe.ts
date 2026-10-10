import type { StepFEFacet } from '@abuddy/sdk/steps';
import { defineAsyncComponent } from 'vue';
import { Play } from 'lucide-vue-next';

export const actionStepFE: StepFEFacet = {
  loadComponents: () => ({ form: defineAsyncComponent(() => import('./form.vue')) }),
  colorKey: 'neutral',
  nodeConfig: {
    icon: Play,
    connectionRules: { inputs: -1, outputs: -1 },
    category: 'action',
    isImplemented: true,
  },
};
