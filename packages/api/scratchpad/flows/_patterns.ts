import type { Track, DSLStepNode, DSLSwitchCondition } from '../types';

/** Standard flow.entry track with optional steps */
export function entryTrack(steps: DSLStepNode[]): Track {
  return { event: 'flow.entry', label: 'Flow Entry', steps };
}

/** Switch node with conditions and optional else */
export function branch(
  conditions: DSLSwitchCondition[],
  elseSteps?: DSLStepNode[],
): DSLStepNode {
  return {
    type: 'switch',
    conditions,
    ...(elseSteps && { else: elseSteps }),
  };
}

/** Entry + keep_alive + event listener pattern */
export function modeTracks(
  entrySteps: DSLStepNode[],
  listeners: { event: string; label?: string; steps: DSLStepNode[] }[],
): Track[] {
  return [
    {
      event: 'flow.entry',
      label: 'Flow Entry',
      steps: [...entrySteps, { type: 'keep_alive' }],
    },
    ...listeners.map(({ event, label, steps }) => ({
      event,
      label: label ?? event,
      steps,
    })),
  ];
}

/** Action step shorthand */
export function action(name: string, opts?: { label?: string; map?: Record<string, string> }): DSLStepNode {
  return { type: 'action', action: name, ...opts };
}

/** Fire event shorthand */
export function fire(event: string, opts?: { label?: string; scope?: 'local' | 'global' }): DSLStepNode {
  return { type: 'fire', event, ...opts };
}

/** Sub-flow step shorthand */
export function subflow(flow: string, opts?: { label?: string; map?: Record<string, string> }): DSLStepNode {
  return { type: 'flow', flow, ...opts };
}
