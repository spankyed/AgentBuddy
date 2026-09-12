import type { StepDefinition } from '@abuddy/sdk/steps';
import { switchStepBuild } from './build';
import { switchStepFE } from './fe';

export const switchStep: StepDefinition = {
  ...switchStepBuild,
  runtime: {
    handler: async (tNode, node, ctx, actor) => {
      const { handler } = await import('./runtime');
      return handler(tNode, node, ctx, actor);
    },
  },
  fe: switchStepFE.fe,
};
