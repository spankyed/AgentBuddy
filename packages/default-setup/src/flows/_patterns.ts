import type { Track, DSLStepNode, DSLSwitchCondition } from '../types';

/**
 * Build the flow.entry track. Each argument is a parallel branch: an array
 * of steps that runs as a sequential chain. Multiple branches fire
 * concurrently from the entry listener.
 *
 * What you pass is what you get — no auto-injected nodes. Include
 * `[keepAlive()]` as one of the branches when the flow should stay alive
 * for listener tracks.
 */
export function entry(...branches: DSLStepNode[][]): Track {
  if (branches.length === 0) {
    throw new Error(
      'entry() requires at least one branch. ' +
      'Use `entry([keepAlive()])` for a flow with no entry steps.',
    );
  }
  return { event: 'flow.entry', label: 'Flow Entry', exits: branches };
}

/**
 * Build a listener track for a specific event. `exits` is the parallel-exit
 * 2D array (each inner array is a sequential chain). Label defaults to the
 * event name.
 */
export function on(event: string, exits: DSLStepNode[][], label?: string): Track {
  return { event, label: label ?? event, exits };
}

/**
 * A node that never completes — a wedge that keeps its parent flow alive
 * while listener tracks wait for events. Usually placed alone in its own
 * entry branch (`entry([keepAlive()])`), but can appear anywhere a step can.
 *
 * If you need more than one keep_alive in the same track, pass custom
 * labels so the validator's label-dedupe pass still sees them as distinct.
 */
export function keepAlive(label: string = 'Keep Alive'): DSLStepNode {
  return { type: 'keep_alive', label };
}

/**
 * Switch node with conditions and optional else. Pass a `label` when the
 * flow has more than one branch — the validator auto-labels switch nodes
 * as "Switch 0" by default and duplicates across tracks collide.
 */
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
