import type { StepDefinition } from '@abuddy/sdk/steps';
import { compile, validate, getLabel, decompile } from './build';

export const llmStep: StepDefinition = {
  type: 'llm',
  build: { compile, validate, getLabel, decompile, relation: { field: 'promptTemplateId', targetEntity: 'Prompt' } },
  runtime: {
    handler: async (tNode, node, ctx, actor) => {
      const { handler } = await import('./runtime');
      return handler(tNode, node, ctx, actor);
    },
    isAsync: true,
  },
  fe: {
    colorKey: 'indigo',
    nodeConfig: {
      label: 'LLM',
      defaultLabel: 'Generate text',
      icon: 'Sparkle',
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
