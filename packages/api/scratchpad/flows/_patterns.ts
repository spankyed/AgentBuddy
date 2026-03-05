import type { Track, DSLStepNode } from '../types';

/** Standard flow.entry track with optional steps */
export function entryTrack(steps: DSLStepNode[]): Track {
  return { event: 'flow.entry', label: 'Flow Entry', steps };
}

/** LLM classify → switch pattern */
export function classifyAndBranch(
  prompt: string,
  branches: { if: string; steps: DSLStepNode[] }[],
  elseSteps?: DSLStepNode[],
): DSLStepNode[] {
  return [
    { type: 'llm', prompt, label: 'classify' },
    {
      type: 'switch',
      label: 'branch',
      conditions: branches,
      ...(elseSteps && { else: elseSteps }),
    },
  ];
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
