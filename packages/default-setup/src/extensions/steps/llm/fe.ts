import type { StepFEFacet } from '@abuddy/sdk/steps';
import { defineAsyncComponent } from 'vue';
import { Sparkle } from 'lucide-vue-next';

export const llmStepFE: StepFEFacet = {
  loadComponents: () => ({ form: defineAsyncComponent(() => import('./form.vue')) }),
  colorKey: 'indigo',
  nodeConfig: {
    icon: Sparkle,
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10',
    hoverBgColor: 'group-hover:bg-indigo-500/15',
    connectionRules: { inputs: 1, outputs: 1 },
    category: 'ai',
    isImplemented: true,
    isDisabled: true,
  },
  // No temperature: the model's own applies, and reasoning models (the default among them) don't take one
};
