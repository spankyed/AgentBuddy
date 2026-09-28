import type { StepDefinition } from '@abuddy/sdk/steps';
import { __CAMEL__StepBuild } from './build.ts';
import { __CAMEL__StepFE } from './fe.ts';

export const __CAMEL__Step: StepDefinition = {
  ...__CAMEL__StepBuild,
  fe: __CAMEL__StepFE.fe,
};
