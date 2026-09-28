import type { StepDefinition } from '@abuddy/sdk/steps';
import { transformStepBuild } from './build.ts';
import { transformStepFE } from './fe.ts';

export const transformStep: StepDefinition = {
  ...transformStepBuild,
  runtime: {
    handler: async (tNode, node, ctx, actor) => {
      const { handler } = await import('./runtime.ts');
      return handler(tNode, node, ctx, actor);
    },
    isAsync: true,
  },
  fe: transformStepFE.fe,
};
