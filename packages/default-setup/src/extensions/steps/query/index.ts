import type { StepDefinition } from '@abuddy/sdk/steps';
import { queryStepBuild } from './build';
import { queryStepFE } from './fe';

export const queryStep: StepDefinition = {
  ...queryStepBuild,
  runtime: {
    handler: async (tNode, node, ctx, actor) => {
      const { handler } = await import('./runtime');
      return handler(tNode, node, ctx, actor);
    },
    isAsync: true,
  },
  fe: queryStepFE.fe,
};
