import {useCurrentFrame} from 'remotion';
import {FlowCanvas} from '../../agentbuddy-ui/flows/FlowCanvas';
import {FlowsList} from '../../agentbuddy-ui/flows/FlowsList';
import {FlowNode} from '../../agentbuddy-ui/flows/FlowNode';
import {FlowNodeForm} from '../../agentbuddy-ui/flows/FlowNodeForm';
import {FlowPalette} from '../../agentbuddy-ui/flows/FlowPalette';
import {SurfaceFrame} from '../../film/SurfaceFrame';
import {WorkflowShot} from '../../film/shots/WorkflowShot';
import {flowNodeFormForFrame} from '../../film/state/flowForms';
import {flowsListMenuState, flowsListSearchState, flowsListState, releaseAutomationWorkflow} from '../../film/state/workflow';

export const FlowsListDemo = () => (
  <SurfaceFrame>
    <div style={{width: '15rem', height: '100%'}}>
      <FlowsList state={flowsListState} />
    </div>
  </SurfaceFrame>
);

export const FlowsListSearchDemo = () => (
  <SurfaceFrame>
    <div style={{width: '15rem', height: '100%'}}>
      <FlowsList state={flowsListSearchState} />
    </div>
  </SurfaceFrame>
);

export const FlowsListMenuDemo = () => (
  <SurfaceFrame>
    <div style={{width: '15rem', height: '100%'}}>
      <FlowsList state={flowsListMenuState} />
    </div>
  </SurfaceFrame>
);

export const FlowPaletteDemo = () => (
  <SurfaceFrame>
    <FlowPalette items={releaseAutomationWorkflow.flow.paletteItems} />
  </SurfaceFrame>
);

export const FlowNodeVariantsDemo = () => (
  <SurfaceFrame>
    {releaseAutomationWorkflow.flow.nodes.map(node => <FlowNode key={node.id} node={node} />)}
  </SurfaceFrame>
);

export const FlowCanvasDemo = () => (
  <SurfaceFrame>
    <FlowCanvas state={releaseAutomationWorkflow.flow} />
  </SurfaceFrame>
);

export const FlowNodeFormDemo = () => {
  const frame = useCurrentFrame();
  const form = flowNodeFormForFrame(frame);
  const selectedNodeId = nodeIdForForm(form.nodeKind);
  return (
    <SurfaceFrame>
      <FlowCanvas
        state={{
          ...releaseAutomationWorkflow.flow,
          editingNodeId: selectedNodeId,
          selectedNodeId,
        }}
      />
      <FlowNodeForm state={form} />
    </SurfaceFrame>
  );
};

function nodeIdForForm(kind: ReturnType<typeof flowNodeFormForFrame>['nodeKind']) {
  if (kind === 'flow' || kind === 'listener') return 'listener';
  if (kind === 'switch' || kind === 'create') return 'codex';
  if (kind === 'schedule' || kind === 'fire') return 'keep';
  return 'claude';
}

export const WorkflowSurfaceDemo = () => {
  const frame = useCurrentFrame();
  return (
    <SurfaceFrame>
      <WorkflowShot frame={frame} />
    </SurfaceFrame>
  );
};
