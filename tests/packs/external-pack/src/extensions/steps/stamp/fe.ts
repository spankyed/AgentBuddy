// How the step is drawn. Its label and field defaults are in `build.ts`, where the backend can read them.
import type { StepFEFacet } from '@abuddy/sdk/steps';
import { Stamp } from 'lucide-vue-next';

export const stampStepFE: StepFEFacet = {
  colorKey: 'violet',
  nodeConfig: {
    icon: Stamp,
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/10',
    hoverBgColor: 'group-hover:bg-violet-500/15',
    connectionRules: { inputs: 1, outputs: 1 },
    category: 'action',
    isImplemented: true,
  },
};
