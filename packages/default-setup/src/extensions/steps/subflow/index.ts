import type { StepDefinition } from '@abuddy/sdk/steps';
import { flowStepBuild } from './build.ts';
import { flowStepFE } from './fe.ts';

export const flowStep: StepDefinition = {
  ...flowStepBuild,
  runtime: { spawnsSubflow: true },
  fe: flowStepFE.fe,
};
