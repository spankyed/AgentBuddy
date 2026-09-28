import type { StepDefinition } from '@abuddy/sdk/steps';
import { defineAsyncComponent } from 'vue';
import { Box } from 'lucide-vue-next';

export const __CAMEL__StepFE: StepDefinition = {
  type: '__TYPE__',
  fe: {
    loadComponents: () => ({ form: defineAsyncComponent(() => import('./form.vue')) }),
    nodeConfig: {
      label: '__LABEL__',
      icon: Box,
      color: 'text-indigo-400',
      bgColor: 'bg-indigo-700/20',
      hoverBgColor: 'group-hover:bg-indigo-700/30',
      connectionRules: { inputs: -1, outputs: -1 },
      category: 'logic',
      isImplemented: true,
    },
  },
};
