import type { StepDefinition } from '@abuddy/sdk/steps';
import { compile, validate, getLabel, decompile } from './build';
import { actionStepFE } from './fe';

export const actionStep: StepDefinition = {
  type: 'action',
  build: { compile, validate, getLabel, decompile, relation: { field: 'actionId', targetEntity: 'Action' } },
  runtime: {
    handler: async (tNode, node, ctx, actor) => {
      const { handler } = await import('./runtime');
      return handler(tNode, node, ctx, actor);
    },
    isAsync: true,
  },
  fe: actionStepFE.fe,
};
