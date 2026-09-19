import type { StepDefinition } from '@abuddy/sdk/steps';
import { scheduleTriggerBuild } from './build';
import { scheduleTriggerFE } from './fe';

export const scheduleTrigger: StepDefinition = {
  ...scheduleTriggerBuild,
  trigger: {
    ...scheduleTriggerBuild.trigger!,
    async register(node, ctx) {
      const { register } = await import('./runtime');
      return register(node, ctx);
    },
  },
  fe: scheduleTriggerFE.fe,
};
