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
      {id: 'listener', kind: 'listener', label: 'start command listener', subtitle: 'user.command', exits: ['exit 1'], x: 360, y: 235},
      {id: 'switch', kind: 'switch', label: 'is /replace-obsolete-apps', branches: [{label: '/replace-obsolete-apps'}, {isElse: true, label: 'Else'}], x: 620, y: 235},
      {id: 'delete-apps', kind: 'action', label: 'Find and delete obsolete apps', x: 930, y: 190, width: 286},
      {id: 'log-result', kind: 'action', label: 'Log obsolete apps removed', x: 930, y: 320, width: 286},
    ],
    edges: [
      {from: 'listener', fromExit: 0, kind: 'transitions_to', to: 'switch'},
      {from: 'switch', fromExit: 0, kind: 'transitions_to', to: 'delete-apps'},
      {from: 'delete-apps', kind: 'transitions_to', to: 'log-result'},
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
  const pressedPaletteKind =
    frame > 64 && frame <= 76 ? 'switch'
      : frame > 130 && frame <= 142 ? 'action'
        : frame > 188 && frame <= 200 ? 'action'
          : undefined;
  const selectedNodeId =
    frame > 72 && frame < 104 ? 'switch'
      : frame > 138 && frame < 170 ? 'delete-apps'
        : frame > 196 && frame < 228 ? 'log-result'
          : frame > 228 ? 'delete-apps'
            : 'listener';
  const visibleNodeIds = new Set([
    'listener',
    ...(frame > 72 ? ['switch'] : []),
    ...(frame > 138 ? ['delete-apps'] : []),
    ...(frame > 196 ? ['log-result'] : []),
  ]);
  const nodes = flow.nodes.filter(node => visibleNodeIds.has(node.id));
  return {
    ...flow,
    editingNodeId: frame > 236 ? 'delete-apps' : undefined,
    nodes,
    paletteItems: flow.paletteItems.map(item => ({
      ...item,
      pressed: item.kind === pressedPaletteKind,
    })),
    edges: flow.edges.filter(edge => visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to)),
    selectedNodeId,
  };
}

export function workflowShotViewForFrame(frame: number): WorkflowShotView {
  return {
    breadcrumbs: releaseAutomationWorkflow.breadcrumbs,
    flow: workflowStateForFrame(frame),
  };
}
