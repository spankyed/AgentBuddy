import type { StepDefinition } from '@abuddy/sdk/steps';
import { compile, decompile, validateTrack, validate } from './build';
import { scheduleTriggerFE } from './fe';

export const scheduleTrigger: StepDefinition = {
  type: 'schedule',
  kind: 'trigger',
  trigger: {
    trackField: 'schedule',
    compile,
    decompile,
    persistent: true,
    async register(node, ctx) {
      const { register } = await import('./runtime');
      return register(node, ctx);
    },
    queryFields: ['cronExpression'],
    validateTrack,
    validate,
  },
  fe: scheduleTriggerFE.fe,
};
