import {useCurrentFrame} from 'remotion';
import {FlowCanvas} from '../../agentbuddy-ui/flows/FlowCanvas';
import {FlowNode} from '../../agentbuddy-ui/flows/FlowNode';
import {FlowPalette} from '../../agentbuddy-ui/flows/FlowPalette';
import {SurfaceFrame} from '../../film/SurfaceFrame';
import {WorkflowShot} from '../../film/shots/WorkflowShot';
import {releaseAutomationWorkflow} from '../../film/state/workflow';

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

export const WorkflowSurfaceDemo = () => {
  const frame = useCurrentFrame();
  return (
    <SurfaceFrame>
      <WorkflowShot frame={frame} />
    </SurfaceFrame>
  );
};
