import type { StepDefinition } from '@abuddy/sdk/steps';
import { listenerTriggerBuild } from './build';
import { listenerTriggerFE } from './fe';

export const listenerTrigger: StepDefinition = {
  ...listenerTriggerBuild,
  fe: listenerTriggerFE.fe,
};
