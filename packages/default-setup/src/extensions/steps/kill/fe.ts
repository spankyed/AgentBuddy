import type { StepDefinition } from '@abuddy/sdk/steps';
import { Plug } from 'lucide-vue-next';

export const killStepFE: StepDefinition = {
  type: 'kill',
  fe: {
    colorKey: 'red',
    nodeConfig: {
      label: 'Kill',
      defaultLabel: 'Kill flow',
      icon: Plug,
      color: 'text-red-400',
      bgColor: 'bg-red-500/10',
      hoverBgColor: 'group-hover:bg-red-500/15',
      connectionRules: { inputs: 1, outputs: 0 },
      component: 'VariableNode',
      category: 'logic',
      isImplemented: true,
    },
  },
};
