import type { Track, DSLStepNode, DSLSwitchCondition } from '../types';

/** Standard flow.entry track with optional steps (single exit) */
export function entryTrack(steps: DSLStepNode[]): Track {
  return { event: 'flow.entry', label: 'Flow Entry', exits: [steps] };
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

/** Entry + keep_alive + event listener pattern. Accepts single or parallel entry exits. */
export function entryWithListeners(
  entryExits: DSLStepNode[] | DSLStepNode[][],
  listeners: { event: string; label?: string; exits: DSLStepNode[][] }[],
): Track[] {
  const exits = (Array.isArray(entryExits[0]) ? entryExits : [entryExits]) as DSLStepNode[][];
  return [
    {
      event: 'flow.entry',
      label: 'Flow Entry',
      exits: exits.map(seq => [...seq, { type: 'keep_alive' as const }]),
    },
    ...listeners.map(({ event, label, exits }) => ({
      event,
      label: label ?? event,
      exits,
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
