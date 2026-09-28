import type { StepDefinition } from '@abuddy/sdk/steps';
import { queryStepBuild } from './build.ts';
import { queryStepFE } from './fe.ts';

export const queryStep: StepDefinition = {
  ...queryStepBuild,
  runtime: {
    handler: async (tNode, node, ctx, actor) => {
      const { handler } = await import('./runtime.ts');
      return handler(tNode, node, ctx, actor);
    },
    isAsync: true,
  },
  fe: queryStepFE.fe,
};
