import type { StepDefinition } from '@abuddy/sdk/steps';
import { fireStepBuild } from './build';
import { fireStepFE } from './fe';

export const fireStep: StepDefinition = {
  ...fireStepBuild,
  runtime: {
    handler: async (tNode, node, ctx, actor) => {
      const { handler } = await import('./runtime');
      return handler(tNode, node, ctx, actor);
    },
  },
  fe: fireStepFE.fe,
};
