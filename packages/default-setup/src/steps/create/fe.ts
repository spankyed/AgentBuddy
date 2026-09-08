import type { StepDefinition } from '@abuddy/sdk/steps';
import { Plus } from 'lucide-vue-next';

export const createStepFE: StepDefinition = {
  type: 'create',
  fe: {
    loadComponents: () => ({ form: require('./form.vue').default }),
    colorKey: 'purple',
    nodeConfig: {
      label: 'Create',
      defaultLabel: 'Create entity',
      icon: Plus,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      hoverBgColor: 'group-hover:bg-purple-500/15',
      connectionRules: { inputs: 1, outputs: 1 },
      component: 'VariableNode',
      category: 'data',
      isImplemented: false,
    },
    defaults: { inferLabel: true },
  },
};
