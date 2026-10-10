import type { StepFEFacet } from '@abuddy/sdk/steps';
import { defineAsyncComponent } from 'vue';
import { Plus } from 'lucide-vue-next';

export const createStepFE: StepFEFacet = {
  loadComponents: () => ({ form: defineAsyncComponent(() => import('./form.vue')) }),
  colorKey: 'purple',
  nodeConfig: {
    label: 'Create',
    defaultLabel: 'Create entity',
    icon: Plus,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    hoverBgColor: 'group-hover:bg-purple-500/15',
    connectionRules: { inputs: 1, outputs: 1 },
    category: 'data',
    isImplemented: true,
  },
  defaults: { inferLabel: true },
};
