import type { DSLStepNode } from '@apackdev/sdk/build';
import type { DSLSwitchCondition } from './types.ts';

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
