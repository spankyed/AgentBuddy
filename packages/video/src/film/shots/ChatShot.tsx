import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {MessageBubble} from '../../agentbuddy-ui/threads/MessageBubble';
import {PlanArtifactCard} from '../../agentbuddy-ui/threads/PlanArtifactCard';
import {ThreadChatCanvas} from '../../agentbuddy-ui/threads/ThreadChatCanvas';
import {ToolActivityBlock} from '../../agentbuddy-ui/threads/ToolActivityBlock';
import {Cursor} from '../overlays/Cursor';
import {chatShotState, chatViewForFrame, launchComposerState, launchPlanArtifact} from '../state/chat';
import {Caret} from './Caret';
import {useAppWindowLayout} from '../appWindowLayout';

export function ChatShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = chatViewForFrame(frame);
  const layout = useAppWindowLayout({variant});
  return (
    <AppWindow activePlugin="threads" breadcrumbs={chatShotState.breadcrumbs} composer={launchComposerState} layout={layout}>
      <ThreadChatCanvas>
        <MessageBubble sender="system">{chatShotState.systemMessage}</MessageBubble>
        <MessageBubble sender="user" createdAt={chatShotState.createdAt}>{view.prompt}<Caret frame={frame} visible={view.promptCaretVisible} /></MessageBubble>
        <MessageBubble sender="assistant" createdAt={chatShotState.createdAt}>
          <ToolActivityBlock rowOpacities={view.toolActivity.rowOpacities} state={view.toolActivity.state} />
          <p>{view.response}</p>
          <PlanArtifactCard artifact={launchPlanArtifact} />
        </MessageBubble>
        <Cursor frame={frame} {...chatShotState.cursorPath} />
      </ThreadChatCanvas>
    </AppWindow>
  );
}
