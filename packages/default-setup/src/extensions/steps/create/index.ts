import type { StepDefinition } from '@abuddy/sdk/steps';
import { createStepBuild } from './build';
import { createStepFE } from './fe';

export const createStep: StepDefinition = {
  ...createStepBuild,
  runtime: {
    handler: async (tNode, node, ctx, actor) => {
      const { handler } = await import('./runtime');
      return handler(tNode, node, ctx, actor);
    },
    isAsync: true,
  },
  fe: createStepFE.fe,
};
