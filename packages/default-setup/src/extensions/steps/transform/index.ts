import type { StepDefinition } from '@abuddy/sdk/steps';
import { transformStepBuild } from './build';
import { transformStepFE } from './fe';

export const transformStep: StepDefinition = {
  ...transformStepBuild,
  fe: transformStepFE.fe,
};
