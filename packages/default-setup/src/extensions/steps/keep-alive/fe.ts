import type { StepFEFacet } from '@abuddy/sdk/steps';
import { Activity } from 'lucide-vue-next';

export const keepAliveStepFE: StepFEFacet = {
  colorKey: 'emerald',
  nodeConfig: {
    icon: Activity,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    hoverBgColor: 'group-hover:bg-emerald-500/15',
    connectionRules: { inputs: 1, outputs: 0 },
    category: 'logic',
    isImplemented: true,
  },
};
