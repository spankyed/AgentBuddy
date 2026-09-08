import type { StepDefinition } from '@abuddy/sdk/steps';
import { compile, validate, getLabel, decompile } from './build';
import { switchStepFE } from './fe';

export const switchStep: StepDefinition = {
  type: 'switch',
  build: { compile, validate, getLabel, decompile },
  runtime: {
    handler: async (tNode, node, ctx, actor) => {
      const { handler } = await import('./runtime');
      return handler(tNode, node, ctx, actor);
    },
  },
  fe: switchStepFE.fe,
};
