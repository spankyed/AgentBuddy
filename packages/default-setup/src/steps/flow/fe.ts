import type { StepDefinition } from '@abuddy/sdk/steps';
import { Workflow } from 'lucide-vue-next';

export const flowStepFE: StepDefinition = {
  type: 'flow',
  fe: {
    loadComponents: () => ({ form: require('./form.vue').default }),
    colorKey: 'purple',
    nodeConfig: {
      label: 'Flow',
      defaultLabel: 'Handle flow',
      icon: Workflow,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      hoverBgColor: 'group-hover:bg-purple-500/15',
      connectionRules: { inputs: 1, outputs: 1 },
      component: 'VariableNode',
      category: 'logic',
      isImplemented: true,
    },
    defaults: { propagateCtx: true },
  },
};
