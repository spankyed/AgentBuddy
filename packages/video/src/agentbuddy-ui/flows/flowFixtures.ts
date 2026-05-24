import type {FlowCanvasState} from './flowTypes';

export const releaseAutomationFlow: FlowCanvasState = {
  breadcrumbs: ['Flows', 'Root Flow (Root)'],
  paletteItems: [
    {kind: 'action', label: 'Action'},
    {kind: 'keep_alive', label: 'Keep alive'},
    {kind: 'listener', label: 'Listener'},
    {kind: 'schedule', label: 'Schedule'},
    {kind: 'llm', label: 'LLM', disabled: true},
    {kind: 'flow', label: 'Flow'},
    {kind: 'switch', label: 'Switch'},
    {kind: 'fire', label: 'Fire'},
    {kind: 'kill', label: 'Kill'},
  ],
  nodes: [
    {id: 'entry', kind: 'entry', label: 'Flow Entry', subtitle: 'flow.entry', exits: ['exit 1', 'exit 2', 'exit 3', 'exit 4', 'exit 5'], status: 'active', x: 47, y: 27},
    {id: 'listener', kind: 'flow', label: 'start command listener', status: 'completed', x: 69, y: 14},
    {id: 'claude', kind: 'flow', label: 'start claude code work mode', x: 69, y: 30},
    {id: 'keep', kind: 'keep_alive', label: 'Keep Alive', status: 'active', x: 69, y: 46},
    {id: 'codex', kind: 'flow', label: 'Start codex', x: 69, y: 62},
    {id: 'onboarding', kind: 'listener', label: 'Start Onboarding', subtitle: 'tour.complete', exits: ['exit 1', 'exit 2'], x: 47, y: 72},
    {id: 'run', kind: 'flow', label: 'run onboarding', x: 68, y: 78},
  ],
  edges: [
    {from: 'entry', fromExit: 0, to: 'listener', dashed: true},
    {from: 'entry', fromExit: 1, to: 'claude', dashed: true},
    {from: 'entry', fromExit: 2, to: 'keep', dashed: true},
    {from: 'entry', fromExit: 3, to: 'codex', dashed: true},
    {from: 'onboarding', fromExit: 0, to: 'run', dashed: true},
  ],
};
