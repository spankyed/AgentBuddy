import type { StepFEFacet } from '@abuddy/sdk/steps';
import { Plug } from 'lucide-vue-next';

export const killStepFE: StepFEFacet = {
  colorKey: 'red',
  nodeConfig: {
    icon: Plug,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    hoverBgColor: 'group-hover:bg-red-500/15',
    connectionRules: { inputs: 1, outputs: 0 },
    category: 'logic',
    isImplemented: true,
  },
};
