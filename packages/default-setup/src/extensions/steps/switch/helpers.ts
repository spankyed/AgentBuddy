import type { DSLStepNode } from '@abuddy/sdk/build';
import type { DSLSwitchCondition } from './types';

export function branch(
  conditions: DSLSwitchCondition[],
  elseSteps?: DSLStepNode[],
  label?: string,
): DSLStepNode {
  return {
    type: 'switch',
    conditions,
    ...(elseSteps && { else: elseSteps }),
    ...(label && { label }),
  };
}
