import type { StepFEFacet } from '@abuddy/sdk/steps';
import { defineAsyncComponent } from 'vue';
import { Clock } from 'lucide-vue-next';

export const scheduleTriggerFE: StepFEFacet = {
  loadComponents: () => ({ form: defineAsyncComponent(() => import('./form.vue')) }),
  nodeConfig: {
    icon: Clock,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    hoverBgColor: 'group-hover:bg-cyan-500/15',
    connectionRules: { inputs: 0, outputs: -1 },
    category: 'trigger',
  },
  colorKey: 'cyan',
};
