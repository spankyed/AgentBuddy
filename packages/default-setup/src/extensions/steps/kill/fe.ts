import type { StepFEFacet } from '@abuddy/sdk/steps';
import { Plug } from 'lucide-vue-next';

export const killStepFE: StepFEFacet = {
  colorKey: 'red',
  nodeConfig: {
    icon: Plug,
    connectionRules: { inputs: 1, outputs: 0 },
    category: 'logic',
    isImplemented: true,
  },
};
