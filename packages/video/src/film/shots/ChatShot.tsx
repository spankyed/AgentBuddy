import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {Cursor} from '../../agentbuddy-ui/primitives/Cursor';
import {MessageBubble} from '../../agentbuddy-ui/threads/MessageBubble';
import {PlanArtifactCard} from '../../agentbuddy-ui/threads/PlanArtifactCard';
import {ThreadChatCanvas} from '../../agentbuddy-ui/threads/ThreadChatCanvas';
import {ToolActivityBlock} from '../../agentbuddy-ui/threads/ToolActivityBlock';
import {chatShotState, chatToolActivity, launchPlanArtifact} from '../state/chat';
import {textReveal} from '../state/timeline';
import {Caret} from './Caret';

export function ChatShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const prompt = textReveal(chatShotState.prompt, frame, 24, 88);
  return (
    <AppWindow activePlugin="threads" variant={variant} breadcrumbs={chatShotState.breadcrumbs}>
      <ThreadChatCanvas>
        <MessageBubble sender="system">{chatShotState.systemMessage}</MessageBubble>
        <MessageBubble sender="user" createdAt="9:41 AM">{prompt}<Caret frame={frame} visible={frame < 90} /></MessageBubble>
        <MessageBubble sender="assistant" createdAt="9:41 AM">
          <ToolActivityBlock artifactLabel={chatShotState.artifactLinkLabel} frame={frame} items={chatToolActivity} />
          <p>{chatShotState.response}</p>
          <PlanArtifactCard artifact={launchPlanArtifact} />
        </MessageBubble>
        <Cursor frame={frame} from={[48, 30]} to={[78, 36]} start={80} end={190} />
      </ThreadChatCanvas>
    </AppWindow>
  );
}
