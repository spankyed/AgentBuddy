import type { StepDefinition } from '@abuddy/sdk/steps';
import { keepAliveStepBuild } from './build.ts';
import { keepAliveStepFE } from './fe.ts';

export const keepAliveStep: StepDefinition = {
  ...keepAliveStepBuild,
  runtime: {
    handler() {},
    waits: true,
  },
  fe: keepAliveStepFE.fe,
};
