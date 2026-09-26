import type { StepDefinition } from '@abuddy/sdk/steps';
import { listenerTriggerBuild } from './build.ts';
import { listenerTriggerFE } from './fe.ts';

export const listenerTrigger: StepDefinition = {
  ...listenerTriggerBuild,
  fe: listenerTriggerFE.fe,
};
