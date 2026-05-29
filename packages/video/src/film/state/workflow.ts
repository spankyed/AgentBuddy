import type {FlowCanvasState, FlowsListState} from '../../agentbuddy-ui/flows/flowTypes';
import {ease, mix} from './timeline';

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
    canvas: {width: 1280, height: 720},
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
      {id: 'listener', kind: 'listener', label: 'start command listener', subtitle: 'user.command', exits: ['exit 1'], x: 330, y: 260},
      {id: 'switch', kind: 'switch', label: 'is /replace-obsolete-apps', branches: [{label: '/replace-obsolete-apps'}, {isElse: true, label: 'Else'}], x: 580, y: 260},
      {id: 'delete-apps', kind: 'action', label: 'Find and delete obsolete apps', x: 890, y: 210, width: 286},
      {id: 'log-result', kind: 'action', label: 'Log obsolete apps removed', x: 890, y: 340, width: 286},
    ],
    edges: [
      {from: 'listener', fromExit: 0, kind: 'transitions_to', to: 'switch'},
      {from: 'switch', fromExit: 0, kind: 'transitions_to', to: 'delete-apps'},
      {from: 'switch', fromExit: 1, kind: 'transitions_to', to: 'log-result'},
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
  const paletteReveal = ease(frame, 268, 326);
  const canvasControlsReveal = ease(frame, 252, 310);
  const listenerPosition = ease(frame, 198, 250);
  const switchReveal = ease(frame, 198, 250);
  const deleteActionReveal = ease(frame, 306, 336);
  const logActionReveal = ease(frame, 326, 354);
  const listener = {
    ...flow.nodes[0],
    style: {
      transform: `translate(${mix(210, 0, listenerPosition)}px, ${mix(18, 0, listenerPosition)}px) scale(${mix(1.08, 1, listenerPosition)})`,
    },
  };
  const switchNode = {
    ...flow.nodes[1],
    style: {
      opacity: switchReveal,
      transform: `translateX(${mix(-64, 0, switchReveal)}px) scale(${mix(0.97, 1, switchReveal)})`,
    },
  };
  const deleteActionNode = {
    ...flow.nodes[2],
    style: {
      opacity: deleteActionReveal,
      transform: `translateX(${mix(-42, 0, deleteActionReveal)}px) scale(${mix(0.985, 1, deleteActionReveal)})`,
    },
  };
  const logActionNode = {
    ...flow.nodes[3],
    style: {
      opacity: logActionReveal,
      transform: `translateX(${mix(-42, 0, logActionReveal)}px) scale(${mix(0.985, 1, logActionReveal)})`,
    },
  };
  const nodes = [
    listener,
    ...(frame >= 86 ? [switchNode] : []),
    ...(frame >= 302 ? [deleteActionNode] : []),
    ...(frame >= 322 ? [logActionNode] : []),
  ];
  const edges = [
    ...(frame >= 226 ? [flow.edges[0]] : []),
    ...(frame >= 316 ? [flow.edges[1]] : []),
    ...(frame >= 338 ? [flow.edges[2]] : []),
  ];
  const selectedNodeId =
    frame > 84 && frame < 154 ? 'listener'
      : frame > 154 && frame < 226 ? 'switch'
        : frame > 226 && frame < 252 ? 'log-result'
          : frame > 252 ? 'delete-apps'
            : 'listener';
  return {
    ...flow,
    chrome: {
      backButtonStyle: {
        opacity: canvasControlsReveal,
        transform: `translateY(${mix(-6, 0, canvasControlsReveal)}px)`,
      },
      controlsStyle: {
        opacity: canvasControlsReveal,
        transform: `translateY(${mix(8, 0, canvasControlsReveal)}px)`,
      },
      paletteStyle: {
        opacity: paletteReveal,
        transform: `translateX(${mix(-32, 0, paletteReveal)}px)`,
        width: `${mix(0, 240, paletteReveal)}px`,
      },
    },
    editingNodeId: frame > 252 ? 'delete-apps' : undefined,
    edges: edges.map(edge => ({...edge, animated: false})),
    nodes,
    selectedNodeId,
    viewport: frame > 252 ? {x: -180, y: 0, zoom: 1} : undefined,
  };
}

export function workflowShotViewForFrame(frame: number): WorkflowShotView {
  return {
    breadcrumbs: releaseAutomationWorkflow.breadcrumbs,
    flow: workflowStateForFrame(frame),
  };
}
