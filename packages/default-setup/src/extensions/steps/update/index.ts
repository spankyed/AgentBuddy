import type { StepDefinition } from '@abuddy/sdk/steps';
import { updateStepBuild } from './build.ts';
import { updateStepFE } from './fe.ts';

export const updateStep: StepDefinition = {
  ...updateStepBuild,
  runtime: {
    handler: async (tNode, node, ctx, actor) => {
      const { handler } = await import('./runtime.ts');
      return handler(tNode, node, ctx, actor);
    },
    isAsync: true,
  },
  fe: updateStepFE.fe,
};
