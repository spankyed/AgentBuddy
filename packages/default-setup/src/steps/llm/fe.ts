import type { StepDefinition } from '@abuddy/sdk/steps';
import { Sparkle } from 'lucide-vue-next';

export const llmStepFE: StepDefinition = {
  type: 'llm',
  fe: {
    loadComponents: () => ({ form: require('./form.vue').default }),
    colorKey: 'indigo',
    nodeConfig: {
      label: 'LLM',
      defaultLabel: 'Generate text',
      icon: Sparkle,
      color: 'text-indigo-400',
      bgColor: 'bg-indigo-500/10',
      hoverBgColor: 'group-hover:bg-indigo-500/15',
      connectionRules: { inputs: 1, outputs: 1 },
      component: 'VariableNode',
      category: 'ai',
      isImplemented: true,
      isDisabled: true,
    },
    defaults: { model: 'gpt-4', temperature: 0.7, maxTokens: 1000 },
  },
};
