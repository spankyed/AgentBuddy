import type { StepFEFacet } from '@apack/sdk/steps';
import { Activity } from 'lucide-vue-next';

export const keepAliveStepFE: StepFEFacet = {
  colorKey: 'emerald',
  nodeConfig: {
    icon: Activity,
    connectionRules: { inputs: 1, outputs: 0 },
    category: 'logic',
    isImplemented: true,
  },
};
