import type { StepDefinition } from '@abuddy/sdk/steps';
import { updateStepBuild } from './build';
import { updateStepFE } from './fe';

export const updateStep: StepDefinition = {
  ...updateStepBuild,
  fe: updateStepFE.fe,
};
