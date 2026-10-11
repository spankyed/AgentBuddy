import type { StepFEFacet } from '@apack/sdk/steps';
import { Radio } from 'lucide-vue-next';

export const pulseTriggerFE: StepFEFacet = {
  colorKey: 'blue',
  nodeConfig: {
    icon: Radio,
    connectionRules: { inputs: 0, outputs: -1 },
    category: 'trigger',
    isImplemented: true,
  },
};
