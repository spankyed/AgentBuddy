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
      {id: 'listener', kind: 'listener', label: 'Command listener', subtitle: 'release.command', exits: ['exit 1'], x: 390, y: 235},
      {id: 'switch', kind: 'switch', label: 'route launch command', branches: [{label: 'create_pr'}, {isElse: true, label: 'Else'}], x: 650, y: 235},
      {id: 'delete', kind: 'action', label: 'Prepare pull request', x: 930, y: 190},
      {id: 'log', kind: 'action', label: 'Notify release thread', x: 930, y: 320},
    ],
    edges: [
      {from: 'listener', fromExit: 0, kind: 'transitions_to', to: 'switch'},
      {from: 'switch', fromExit: 0, kind: 'transitions_to', to: 'delete'},
      {from: 'delete', kind: 'transitions_to', to: 'log'},
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
  const flow = releaseAutomationWorkflow.flow;
  return {
    ...flow,
    editingNodeId: frame > 218 ? 'delete' : undefined,
  };
}

export function workflowShotViewForFrame(frame: number): WorkflowShotView {
  return {
    breadcrumbs: releaseAutomationWorkflow.breadcrumbs,
    flow: workflowStateForFrame(frame),
  };
}
