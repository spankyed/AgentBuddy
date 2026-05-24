import {useCurrentFrame} from 'remotion';
import {ChatComposer} from '../../agentbuddy-ui/chat/ChatComposer';
import {MessageBubble} from '../../agentbuddy-ui/threads/MessageBubble';
import {PlanArtifactCard} from '../../agentbuddy-ui/threads/PlanArtifactCard';
import {ToolActivityBlock} from '../../agentbuddy-ui/threads/ToolActivityBlock';
import {SurfaceFrame} from '../../film/SurfaceFrame';
import {ChatShot} from '../../film/shots/ChatShot';
import {
  launchComposerState,
  launchComposerWithAttachmentState,
  launchPlanArtifact,
  messageBubbleDemoState,
  toolActivityViewForFrame,
} from '../../film/state/chat';
import {DemoBottomSlot, DemoSlot} from '../DemoLayout';

export const ChatComposerDemo = () => (
  <SurfaceFrame>
    <DemoBottomSlot>
      <ChatComposer state={launchComposerState} />
    </DemoBottomSlot>
  </SurfaceFrame>
);

export const ChatComposerWithAttachmentDemo = () => (
  <SurfaceFrame>
    <DemoBottomSlot>
      <ChatComposer state={launchComposerWithAttachmentState} />
    </DemoBottomSlot>
  </SurfaceFrame>
);

export const ToolActivityDemo = () => {
  const frame = useCurrentFrame();
  const view = toolActivityViewForFrame(frame);
  return (
    <SurfaceFrame>
      <DemoSlot style={{left: 240, top: 112, width: 620}}>
        <ToolActivityBlock rowOpacities={view.rowOpacities} state={view.state} />
      </DemoSlot>
      <DemoSlot style={{right: 240, bottom: 120, width: 520}}>
        <PlanArtifactCard artifact={launchPlanArtifact} />
      </DemoSlot>
    </SurfaceFrame>
  );
};

export const PlanArtifactDemo = () => (
  <SurfaceFrame>
    <DemoSlot style={{left: 320, right: 320, top: 128, bottom: 128}}>
      <PlanArtifactCard artifact={launchPlanArtifact} />
    </DemoSlot>
  </SurfaceFrame>
);

export const MessageBubbleDemo = () => (
  <SurfaceFrame>
    <DemoSlot style={{left: 220, right: 220, top: 104}}>
      <MessageBubble sender="system">{messageBubbleDemoState.system}</MessageBubble>
      <MessageBubble sender="user" createdAt={messageBubbleDemoState.createdAt}>{messageBubbleDemoState.user}</MessageBubble>
      <MessageBubble sender="user" createdAt={messageBubbleDemoState.createdAt} status="queued">{messageBubbleDemoState.queuedUser}</MessageBubble>
      <MessageBubble sender="user" createdAt={messageBubbleDemoState.createdAt} status="cancelled">{messageBubbleDemoState.cancelledUser}</MessageBubble>
      <MessageBubble sender="assistant" createdAt={messageBubbleDemoState.createdAt}>{messageBubbleDemoState.assistant}</MessageBubble>
    </DemoSlot>
  </SurfaceFrame>
);

export const ChatSurfaceDemo = () => {
  const frame = useCurrentFrame();
  return (
    <SurfaceFrame>
      <ChatShot frame={frame} />
    </SurfaceFrame>
  );
};
