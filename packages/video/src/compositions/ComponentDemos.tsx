import {useCurrentFrame} from 'remotion';
import {AppWindow} from '../agentbuddy-ui/chrome/AppWindow';
import {ChatComposer} from '../agentbuddy-ui/chat/ChatComposer';
import {FlowCanvas} from '../agentbuddy-ui/flows/FlowCanvas';
import {FlowPalette} from '../agentbuddy-ui/flows/FlowPalette';
import {FlowNode} from '../agentbuddy-ui/flows/FlowNode';
import {releaseAutomationFlow} from '../film/state/workflow';
import {NotesShot} from '../film/shots/NotesShot';
import {ChatShot} from '../film/shots/ChatShot';
import {BoardShot} from '../film/shots/BoardShot';
import {CodeShot} from '../film/shots/CodeShot';
import {WorkflowShot} from '../film/shots/WorkflowShot';
import {SurfaceFrame} from '../film/SurfaceFrame';

export const ToolbarDemo = () => <SurfaceFrame><AppWindow activePlugin="code" breadcrumbs={['Code', 'Demo']} composer={false}><div /></AppWindow></SurfaceFrame>;

export const ChatComposerDemo = () => (
  <SurfaceFrame>
    <div style={{position: 'absolute', left: 0, right: 0, bottom: 80}}>
      <ChatComposer state={{placeholder: 'Message Agent', mode: 'Codex', phase: 'Plan'}} />
    </div>
  </SurfaceFrame>
);

export const ChatComposerWithAttachmentDemo = () => (
  <SurfaceFrame>
    <div style={{position: 'absolute', left: 0, right: 0, bottom: 80}}>
      <ChatComposer state={{placeholder: 'Message Agent', mode: 'Codex', phase: 'Plan', attachments: [{type: 'image', label: 'image 1'}]}} />
    </div>
  </SurfaceFrame>
);

export const FlowPaletteDemo = () => <SurfaceFrame><FlowPalette items={releaseAutomationFlow.paletteItems} /></SurfaceFrame>;

export const FlowNodeVariantsDemo = () => (
  <SurfaceFrame>
    {releaseAutomationFlow.nodes.map(node => <FlowNode key={node.id} node={node} />)}
  </SurfaceFrame>
);

export const FlowCanvasDemo = () => <SurfaceFrame><FlowCanvas state={releaseAutomationFlow} /></SurfaceFrame>;

export const BoardSurfaceDemo = () => {
  const frame = useCurrentFrame();
  return <SurfaceFrame><BoardShot frame={frame} /></SurfaceFrame>;
};

export const CodeSurfaceDemo = () => {
  const frame = useCurrentFrame();
  return <SurfaceFrame><CodeShot frame={frame} /></SurfaceFrame>;
};

export const NotesSurfaceDemo = () => {
  const frame = useCurrentFrame();
  return <SurfaceFrame><NotesShot frame={frame} /></SurfaceFrame>;
};

export const ChatSurfaceDemo = () => {
  const frame = useCurrentFrame();
  return <SurfaceFrame><ChatShot frame={frame} /></SurfaceFrame>;
};

export const WorkflowSurfaceDemo = () => {
  const frame = useCurrentFrame();
  return <SurfaceFrame><WorkflowShot frame={frame} /></SurfaceFrame>;
};
