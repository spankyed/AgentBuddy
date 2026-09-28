import type { StepDefinition } from '@abuddy/sdk/steps';
import { scheduleTriggerBuild } from './build.ts';
import { scheduleTriggerFE } from './fe.ts';

export const scheduleTrigger: StepDefinition = {
  ...scheduleTriggerBuild,
  trigger: {
    ...scheduleTriggerBuild.trigger!,
    async register(node, ctx) {
      const { register } = await import('./runtime.ts');
      return register(node, ctx);
    },
  },
  fe: scheduleTriggerFE.fe,
};
