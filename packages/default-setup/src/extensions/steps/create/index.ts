import type { StepDefinition } from '@abuddy/sdk/steps';
import { createStepBuild } from './build.ts';
import { createStepFE } from './fe.ts';

export const createStep: StepDefinition = {
  ...createStepBuild,
  runtime: {
    handler: async (tNode, node, ctx, actor) => {
      const { handler } = await import('./runtime.ts');
      return handler(tNode, node, ctx, actor);
    },
    isAsync: true,
  },
  fe: createStepFE.fe,
};
