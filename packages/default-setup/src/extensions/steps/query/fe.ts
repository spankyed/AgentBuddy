import type { StepDefinition } from '@abuddy/sdk/steps';
import { defineAsyncComponent } from 'vue';
import { Search } from 'lucide-vue-next';

export const queryStepFE: StepDefinition = {
  type: 'query',
  fe: {
    loadComponents: () => ({ form: defineAsyncComponent(() => import('./form.vue')) }),
    colorKey: 'cyan',
    nodeConfig: {
      label: 'Query',
      defaultLabel: 'Query',
      icon: Search,
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10',
      hoverBgColor: 'group-hover:bg-cyan-500/15',
      connectionRules: { inputs: 1, outputs: 1 },
      component: 'VariableNode',
      category: 'data',
      isImplemented: true,
    },
  },
};
