import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {Cursor} from '../../agentbuddy-ui/primitives/Cursor';
import {MessageBubble} from '../../agentbuddy-ui/threads/MessageBubble';
import {PlanArtifactCard} from '../../agentbuddy-ui/threads/PlanArtifactCard';
import {ThreadChatCanvas} from '../../agentbuddy-ui/threads/ThreadChatCanvas';
import {ToolActivityBlock} from '../../agentbuddy-ui/threads/ToolActivityBlock';
import {textReveal} from '../state/timeline';
import {Caret} from './Caret';

export function ChatShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const prompt = textReveal('Turn this launch brief into tickets, notes, and a shippable PR plan.', frame, 24, 88);
  const work = [
    {title: 'Read launch memory', status: 'done' as const},
    {title: 'Create execution tickets', status: 'done' as const},
    {title: 'Draft code branch plan', status: 'active' as const},
    {title: 'Schedule release workflow', status: 'queued' as const},
  ];
  return (
    <AppWindow activePlugin="threads" variant={variant} breadcrumbs={['Threads', 'Launch Thread']}>
      <ThreadChatCanvas>
        <MessageBubble sender="system">Launch AgentBuddy</MessageBubble>
        <MessageBubble sender="user">{prompt}<Caret frame={frame} visible={frame < 90} /></MessageBubble>
        <MessageBubble sender="assistant">
          <ToolActivityBlock frame={frame} items={work} />
          <p>I found the launch context and turned it into an execution plan.</p>
          <PlanArtifactCard artifact={{
            title: 'Launch Operating Plan',
            status: 'in-progress',
            notes: ['Capture launch context', 'Create execution tickets', 'Generate branch and PR plan', 'Automate release checks'],
          }} />
        </MessageBubble>
        <Cursor frame={frame} from={[48, 30]} to={[78, 36]} start={80} end={190} />
      </ThreadChatCanvas>
    </AppWindow>
  );
}
