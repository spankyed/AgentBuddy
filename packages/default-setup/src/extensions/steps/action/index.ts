import type { StepDefinition } from '@abuddy/sdk/steps';
import { actionStepBuild } from './build';
import { actionStepFE } from './fe';

export const actionStep: StepDefinition = {
  ...actionStepBuild,
  runtime: {
    handler: async (tNode, node, ctx, actor) => {
      const { handler } = await import('./runtime');
      return handler(tNode, node, ctx, actor);
    },
    isAsync: true,
  },
  fe: actionStepFE.fe,
};
