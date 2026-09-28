import type { StepDefinition } from '@abuddy/sdk/steps';
import { actionStepBuild } from './build.ts';
import { actionStepFE } from './fe.ts';

export const actionStep: StepDefinition = {
  ...actionStepBuild,
  runtime: {
    handler: async (tNode, node, ctx, actor) => {
      const { handler } = await import('./runtime.ts');
      return handler(tNode, node, ctx, actor);
    },
    isAsync: true,
  },
  fe: actionStepFE.fe,
};
