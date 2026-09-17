import type { StepDefinition } from '@abuddy/sdk/steps';
import { transformStepBuild } from './build';
import { transformStepFE } from './fe';

export const transformStep: StepDefinition = {
  ...transformStepBuild,
  runtime: {
    handler: async (tNode, node, ctx, actor) => {
      const { handler } = await import('./runtime');
      return handler(tNode, node, ctx, actor);
    },
    isAsync: true,
  },
  fe: transformStepFE.fe,
};
