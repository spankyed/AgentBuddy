import type { Track, DSLStepNode, DSLSwitchCondition } from './dsl-types';

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

export function keepAlive(label: string = 'Keep Alive'): DSLStepNode {
  return { type: 'keep_alive', label };
}

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

export function action(name: string, opts?: { label?: string; map?: Record<string, string> }): DSLStepNode {
  return { type: 'action', action: name, ...opts };
}

export function fire(event: string, opts?: { label?: string; scope?: 'local' | 'global' }): DSLStepNode {
  return { type: 'fire', event, ...opts };
}

export function subflow(flow: string, opts?: { label?: string; map?: Record<string, string> }): DSLStepNode {
  return { type: 'flow', flow, ...opts };
}

export function killFlow(label: string = 'Kill Flow'): DSLStepNode {
  return { type: 'kill', label } as DSLStepNode;
}

export function schedule(cron: string, exits: DSLStepNode[][], label?: string): Track {
  return { schedule: cron, label: label ?? `Schedule (${cron})`, exits };
}
