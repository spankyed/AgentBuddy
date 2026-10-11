import type { StepFEFacet } from '@apack/sdk/steps';
import { defineAsyncComponent } from 'vue';
import { Radio } from 'lucide-vue-next';

export const listenerTriggerFE: StepFEFacet = {
  loadComponents: () => ({ form: defineAsyncComponent(() => import('./form.vue')) }),
  nodeConfig: {
    icon: Radio,
    connectionRules: { inputs: 0, outputs: -1 },
    category: 'trigger',
    isImplemented: true,
  },
  colorKey: 'blue',
};
