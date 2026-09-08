import type { StepDefinition } from '@abuddy/sdk/steps';
import { Activity } from 'lucide-vue-next';

export const keepAliveStepFE: StepDefinition = {
  type: 'keep_alive',
  fe: {
    colorKey: 'emerald',
    nodeConfig: {
      label: 'Keep alive',
      defaultLabel: 'Keep alive',
      icon: Activity,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      hoverBgColor: 'group-hover:bg-emerald-500/15',
      connectionRules: { inputs: 1, outputs: 0 },
      component: 'VariableNode',
      category: 'logic',
      isImplemented: true,
    },
  },
};
