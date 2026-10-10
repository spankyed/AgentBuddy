import type { StepFEFacet } from '@abuddy/sdk/steps';
import { Radio } from 'lucide-vue-next';

export const pulseTriggerFE: StepFEFacet = {
  colorKey: 'blue',
  nodeConfig: {
    icon: Radio,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    hoverBgColor: 'group-hover:bg-blue-500/15',
    connectionRules: { inputs: 0, outputs: -1 },
    category: 'trigger',
    isImplemented: true,
  },
};
