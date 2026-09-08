import type { StepDefinition } from '@abuddy/sdk/steps';
import { defineAsyncComponent } from 'vue';
import { Play } from 'lucide-vue-next';

export const actionStepFE: StepDefinition = {
  type: 'action',
  fe: {
    loadComponents: () => ({ form: defineAsyncComponent(() => import('./form.vue')) }),
    colorKey: 'neutral',
    nodeConfig: {
      label: 'Action',
      defaultLabel: 'Do action',
      icon: Play,
      color: 'text-neutral-400',
      bgColor: 'bg-neutral-700/20',
      hoverBgColor: 'group-hover:bg-neutral-700/30',
      connectionRules: { inputs: -1, outputs: -1 },
      component: 'ActionNode',
      category: 'action',
      isImplemented: true,
    },
  },
};
