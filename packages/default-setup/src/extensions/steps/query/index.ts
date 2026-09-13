import type { StepDefinition } from '@abuddy/sdk/steps';
import { queryStepBuild } from './build';
import { queryStepFE } from './fe';

export const queryStep: StepDefinition = {
  ...queryStepBuild,
  fe: queryStepFE.fe,
};
