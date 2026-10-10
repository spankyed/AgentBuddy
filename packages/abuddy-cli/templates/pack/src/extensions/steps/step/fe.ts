import type { StepFEFacet } from '@abuddy/sdk/steps';
import { defineAsyncComponent } from 'vue';
import { Box } from 'lucide-vue-next';

// How the step is drawn. Its label and the fields a new node starts with are not here: they are what both
// the backend and the canvas read, so they live in the `node` facet beside the build facet.
export const __CAMEL__StepFE: StepFEFacet = {
  loadComponents: () => ({ form: defineAsyncComponent(() => import('./form.vue')) }),
  nodeConfig: {
    icon: Box,
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-700/20',
    hoverBgColor: 'group-hover:bg-indigo-700/30',
    connectionRules: { inputs: -1, outputs: -1 },
    category: 'logic',
    isImplemented: true,
  },
};
