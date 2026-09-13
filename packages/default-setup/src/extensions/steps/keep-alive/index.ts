import type { StepDefinition } from '@abuddy/sdk/steps';
import { keepAliveStepBuild } from './build';
import { keepAliveStepFE } from './fe';

export const keepAliveStep: StepDefinition = {
  ...keepAliveStepBuild,
  runtime: {
    handler() {},
  },
  fe: keepAliveStepFE.fe,
};
