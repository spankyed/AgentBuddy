import type { StepDefinition } from '@abuddy/sdk/steps';
import { updateStepBuild } from './build';
import { updateStepFE } from './fe';

export const updateStep: StepDefinition = {
  ...updateStepBuild,
  runtime: {
    handler: async (tNode, node, ctx, actor) => {
      const { handler } = await import('./runtime');
      return handler(tNode, node, ctx, actor);
    },
    isAsync: true,
  },
  fe: updateStepFE.fe,
};
