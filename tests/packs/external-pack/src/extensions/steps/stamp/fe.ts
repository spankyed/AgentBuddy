// How the step is drawn. Its label and field defaults are in `build.ts`, where the backend can read them.
import type { StepFEFacet } from '@apack/sdk/steps';
import { Stamp } from 'lucide-vue-next';

export const stampStepFE: StepFEFacet = {
  colorKey: 'purple',
  nodeConfig: {
    icon: Stamp,
    connectionRules: { inputs: 1, outputs: 1 },
    category: 'action',
    isImplemented: true,
  },
};
