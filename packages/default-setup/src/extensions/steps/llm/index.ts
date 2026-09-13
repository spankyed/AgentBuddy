import type { StepDefinition } from '@abuddy/sdk/steps';
import { llmStepBuild } from './build';
import { llmStepFE } from './fe';

export const llmStep: StepDefinition = {
  ...llmStepBuild,
  runtime: {
    handler: async (tNode, node, ctx, actor) => {
      const { handler } = await import('./runtime');
      return handler(tNode, node, ctx, actor);
    },
    isAsync: true,
  },
  fe: llmStepFE.fe,
};
