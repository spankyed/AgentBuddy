import type { StepDefinition } from '@abuddy/sdk/steps';
import { flowStepBuild } from './build';
import { flowStepFE } from './fe';

export const flowStep: StepDefinition = {
  ...flowStepBuild,
  runtime: { spawnsSubflow: true },
  fe: flowStepFE.fe,
};
