import type {FlowCanvasState} from '../../agentbuddy-ui/flows/flowTypes';
import {ease} from './timeline';

type WorkflowExecutionStep = {
  edgeIds?: string[];
  from: number;
  nodeIds: string[];
  status: 'active' | 'completed';
};

export type WorkflowShotState = {
  breadcrumbs: string[];
  flow: FlowCanvasState;
};

export const releaseAutomationWorkflow: WorkflowShotState = {
  breadcrumbs: ['Flows', 'Root Flow (Root)'],
  flow: {
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
  },
};

export const workflowExecutionTimeline: WorkflowExecutionStep[] = [
  {from: 36, nodeIds: ['entry'], status: 'active'},
  {from: 72, nodeIds: ['entry'], status: 'completed', edgeIds: ['entry:listener']},
  {from: 92, nodeIds: ['listener'], status: 'active', edgeIds: ['entry:listener']},
  {from: 132, nodeIds: ['listener'], status: 'completed', edgeIds: ['entry:listener']},
  {from: 150, nodeIds: ['claude'], status: 'active', edgeIds: ['entry:claude']},
  {from: 184, nodeIds: ['claude'], status: 'completed', edgeIds: ['entry:claude']},
  {from: 202, nodeIds: ['keep'], status: 'active', edgeIds: ['entry:keep']},
  {from: 236, nodeIds: ['keep'], status: 'completed', edgeIds: ['entry:keep']},
  {from: 252, nodeIds: ['codex'], status: 'active', edgeIds: ['entry:codex']},
];

export function workflowStateForFrame(frame: number): FlowCanvasState {
  const nodeStatus = new Map<string, 'active' | 'completed'>();
  const edgeStatus = new Map<string, 'active' | 'completed'>();
  const flow = releaseAutomationWorkflow.flow;
  let editingNodeId = flow.editingNodeId;
  let selectedNodeId = flow.selectedNodeId;

  for (const step of workflowExecutionTimeline) {
    if (frame < step.from) continue;
    for (const nodeId of step.nodeIds) {
      nodeStatus.set(nodeId, step.status);
      editingNodeId = step.status === 'active' ? nodeId : editingNodeId;
      selectedNodeId = nodeId;
    }
    for (const edgeId of step.edgeIds ?? []) {
      edgeStatus.set(edgeId, step.status);
    }
  }

  return {
    ...flow,
    editingNodeId,
    selectedNodeId,
    nodes: flow.nodes.map(node => ({
      ...node,
      status: nodeStatus.get(node.id) ?? node.status,
    })),
    edges: flow.edges.map(edge => ({
      ...edge,
      status: edgeStatus.get(`${edge.from}:${edge.to}`),
    })),
    viewport: workflowViewportForFrame(frame),
  };
}

export function workflowViewportForFrame(frame: number): NonNullable<FlowCanvasState['viewport']> {
  const firstMove = ease(frame, 40, 118);
  const secondMove = ease(frame, 170, 268);
  return {
    x: -2.5 * firstMove - 4 * secondMove,
    y: 3 * firstMove - 6 * secondMove,
    zoom: 1 + 0.08 * firstMove + 0.08 * secondMove,
  };
}
