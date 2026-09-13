import type { Track, DSLStepNode } from './compilers/flow-types.js';

export function entry(...branches: DSLStepNode[][]): Track {
  if (branches.length === 0) {
    throw new Error(
      'entry() requires at least one branch. ' +
      'Use `entry([keepAlive()])` for a flow with no entry steps.',
    );
  }
  return { event: 'flow.entry', label: 'Flow Entry', exits: branches };
}

export function on(event: string, exits: DSLStepNode[][], label?: string): Track {
  return { event, label: label ?? event, exits };
}
