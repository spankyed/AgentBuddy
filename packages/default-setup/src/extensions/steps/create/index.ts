import type { StepDefinition } from '@abuddy/sdk/steps';
import { createStepBuild } from './build';
import { createStepFE } from './fe';

export const createStep: StepDefinition = {
  ...createStepBuild,
  fe: createStepFE.fe,
};
