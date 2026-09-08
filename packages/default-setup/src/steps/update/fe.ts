import type { StepDefinition } from '@abuddy/sdk/steps';
import { RefreshCw } from 'lucide-vue-next';

export const updateStepFE: StepDefinition = {
  type: 'update',
  fe: {
    colorKey: 'purple',
    nodeConfig: {
      label: 'Update',
      defaultLabel: 'Update entity',
      icon: RefreshCw,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      hoverBgColor: 'group-hover:bg-purple-500/15',
      connectionRules: { inputs: 1, outputs: 1 },
      component: 'VariableNode',
      category: 'data',
      isImplemented: false,
    },
    defaults: { onMissing: 'fail' },
  },
};
