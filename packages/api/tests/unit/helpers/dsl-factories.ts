import { compile } from '@/systems/flows/dsl/compiler';
import type { FlowDSL } from '@/systems/flows/dsl/types';
import { findEntity } from './compiled-result';

/** Wrap steps in a minimal single-track flow DSL (flow name 'F', default event 'go') */
export function wrapInFlow(steps: any[], event = 'go'): FlowDSL {
  return { 'F': [{ event, exits: [steps] }] };
}

/** Build a FlowDSL containing a switch node as the first step, with optional else and after-step */
export function makeSwitchDSL(
  conditions: Array<{ if: string; steps: any[] }>,
  elseSteps?: any[],
  afterStep?: any,
): FlowDSL {
  const steps: any[] = [
    {
      type: 'switch',
      conditions,
      ...(elseSteps ? { else: elseSteps } : {}),
    },
  ];
  if (afterStep) steps.push(afterStep);
  return wrapInFlow(steps);
}

/** Compile a switch with a single condition and return its parsed predicate */
export function parsedPredicate(expr: string) {
  const dsl = wrapInFlow([{
    type: 'switch',
    conditions: [{ if: expr, steps: [{ type: 'action', action: 'x' }] }],
  }]);
  const result = compile(dsl);
  const switchNode = findEntity(result.entity, (e: any) => e.nodeType === 'switch');
  return switchNode.conditions[0].predicate;
}
