import type { StepFEFacet } from '@abuddy/sdk/steps';
import { defineAsyncComponent } from 'vue';
import { Clock } from 'lucide-vue-next';

export const scheduleTriggerFE: StepFEFacet = {
  loadComponents: () => ({ form: defineAsyncComponent(() => import('./form.vue')) }),
  nodeConfig: {
    icon: Clock,
    connectionRules: { inputs: 0, outputs: -1 },
    category: 'trigger',
  },
  colorKey: 'cyan',
};
