import type { StepDefinition } from '@abuddy/sdk/steps';
import { defineAsyncComponent } from 'vue';
import { RefreshCw } from 'lucide-vue-next';

export const updateStepFE: StepDefinition = {
  type: 'update',
  fe: {
    loadComponents: () => ({ form: defineAsyncComponent(() => import('./form.vue')) }),
    colorKey: 'purple',
    nodeConfig: {
      label: 'Update',
      defaultLabel: 'Update entity',
      icon: RefreshCw,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      hoverBgColor: 'group-hover:bg-purple-500/15',
      connectionRules: { inputs: 1, outputs: 1 },
      category: 'data',
      isImplemented: true,
    },
    defaults: { onMissing: 'fail' },
  },
};
