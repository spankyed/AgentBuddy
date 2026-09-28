import type { StepDefinition } from '@abuddy/sdk/steps';
import { switchStepBuild } from './build.ts';
import { switchStepFE } from './fe.ts';

export const switchStep: StepDefinition = {
  ...switchStepBuild,
  runtime: {
    handler: async (tNode, node, ctx, actor) => {
      const { handler } = await import('./runtime.ts');
      return handler(tNode, node, ctx, actor);
    },
  },
  fe: switchStepFE.fe,
};
