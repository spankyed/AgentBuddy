import type { StepDefinition } from '@abuddy/sdk/steps';
import { compile, validate, getLabel, decompile } from './build';
import { llmStepFE } from './fe';

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
  fe: llmStepFE.fe,
};
