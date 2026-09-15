import type { StepDefinition } from '@abuddy/sdk/steps';
import { defineAsyncComponent } from 'vue';
import { Shuffle } from 'lucide-vue-next';

export const transformStepFE: StepDefinition = {
  type: 'transform',
  fe: {
    loadComponents: () => ({ form: defineAsyncComponent(() => import('./form.vue')) }),
    colorKey: 'emerald',
    nodeConfig: {
      label: 'Transform',
      defaultLabel: 'Transform output',
      icon: Shuffle,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      hoverBgColor: 'group-hover:bg-emerald-500/15',
      connectionRules: { inputs: 1, outputs: 1 },
      component: 'VariableNode',
      category: 'data',
      isImplemented: true,
    },
    defaults: { outputType: 'json' },
  },
};
