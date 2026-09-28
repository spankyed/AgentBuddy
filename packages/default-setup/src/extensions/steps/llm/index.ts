import type { StepDefinition } from '@abuddy/sdk/steps';
import { llmStepBuild } from './build.ts';
import { llmStepFE } from './fe.ts';

export const llmStep: StepDefinition = {
  ...llmStepBuild,
  runtime: {
    handler: async (tNode, node, ctx, actor) => {
      const { handler } = await import('./runtime.ts');
      return handler(tNode, node, ctx, actor);
    },
    isAsync: true,
  },
  fe: llmStepFE.fe,
};
