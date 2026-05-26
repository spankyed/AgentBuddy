import type {FlowCanvasState, FlowsListState} from '../../agentbuddy-ui/flows/flowTypes';

export type WorkflowShotState = {
  breadcrumbs: string[];
  flow: FlowCanvasState;
};

export type WorkflowShotView = {
  breadcrumbs: string[];
  flow: FlowCanvasState;
};

export const releaseAutomationWorkflow: WorkflowShotState = {
  breadcrumbs: ['Flows', 'Root Flow (Root)'],
  flow: {
    canvas: {width: 1120, height: 720},
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
      {id: 'entry', kind: 'entry', label: 'Flow Entry', subtitle: 'flow.entry', exits: ['exit 1', 'exit 2', 'exit 3', 'exit 4', 'exit 5'], x: 620, y: 185},
      {id: 'listener', kind: 'flow', label: 'start command listener', x: 900, y: 98},
      {id: 'claude', kind: 'flow', label: 'start claude code work mode', x: 900, y: 232},
      {id: 'keep', kind: 'keep_alive', label: 'Keep Alive', x: 920, y: 355},
      {id: 'codex', kind: 'flow', label: 'Start codex', x: 920, y: 482},
      {id: 'onboarding', kind: 'listener', label: 'Start Onboarding', subtitle: 'tour.complete', exits: ['exit 1', 'exit 2'], x: 615, y: 545},
      {id: 'run', kind: 'flow', label: 'run onboarding', x: 900, y: 640},
    ],
    edges: [
      {from: 'entry', fromExit: 0, kind: 'transitions_to', to: 'listener'},
      {from: 'entry', fromExit: 1, kind: 'transitions_to', to: 'claude'},
      {from: 'entry', fromExit: 2, kind: 'transitions_to', to: 'keep'},
      {from: 'entry', fromExit: 3, kind: 'transitions_to', to: 'codex'},
      {from: 'onboarding', fromExit: 0, kind: 'transitions_to', to: 'run'},
    ],
  },
};

export const flowsListState: FlowsListState = {
  rootFlowId: 'root',
  selectedFlowId: 'release-automation',
  focusedFlowId: 'release-automation',
  flows: [
    {id: 'root', label: 'Root Flow', description: 'Default entrypoint for AgentBuddy'},
    {id: 'release-automation', label: 'Release Automation', description: 'Launch film publishing path'},
    {id: 'onboarding', label: 'Start Onboarding', description: 'Tour completion trigger'},
    {id: 'claude-code-work-mode', label: 'Claude Code Work Mode', description: 'Development workspace loop'},
    {id: 'daily-summary', label: 'Daily Summary', description: 'Scheduled memory digest'},
  ],
};

export const flowsListSearchState: FlowsListState = {
  ...flowsListState,
  searchMode: true,
  searchQuery: 'release',
};

export const flowsListMenuState: FlowsListState = {
  ...flowsListState,
  menuFlowId: 'release-automation',
};

export function workflowStateForFrame(frame: number): FlowCanvasState {
  void frame;
  return releaseAutomationWorkflow.flow;
}

export function workflowShotViewForFrame(frame: number): WorkflowShotView {
  return {
    breadcrumbs: releaseAutomationWorkflow.breadcrumbs,
    flow: workflowStateForFrame(frame),
  };
}
