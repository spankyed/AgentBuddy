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
    {tool: 'Read', summary: 'notes/agentbuddy/tasklist/current.md', status: 'ok' as const, durationMs: 312, outputSummary: 'Launch notes loaded'},
    {tool: 'Task', summary: 'create execution tickets from launch context', status: 'ok' as const, durationMs: 1280, outputSummary: '4 tickets created'},
    {tool: 'Write', summary: 'packages/video/src/film/state/launch-plan.ts', status: 'running' as const},
    {tool: 'Bash', summary: 'npm run compile:flows', status: 'running' as const, durationMs: 5200},
  ];
  return (
    <AppWindow activePlugin="threads" variant={variant} breadcrumbs={['Threads', 'Launch Thread']}>
      <ThreadChatCanvas>
        <MessageBubble sender="system">Launch AgentBuddy</MessageBubble>
        <MessageBubble sender="user" createdAt="9:41 AM">{prompt}<Caret frame={frame} visible={frame < 90} /></MessageBubble>
        <MessageBubble sender="assistant" createdAt="9:41 AM" typing={frame < 126}>
          <ToolActivityBlock frame={frame} items={work} />
          <p>I found the launch context and turned it into an execution plan.</p>
          <PlanArtifactCard artifact={{
            title: 'Launch Operating Plan',
            status: 'in-progress',
            notes: '- Capture launch context\n- Create execution tickets\n- Generate branch and PR plan\n- Automate release checks',
          }} />
        </MessageBubble>
        <Cursor frame={frame} from={[48, 30]} to={[78, 36]} start={80} end={190} />
      </ThreadChatCanvas>
    </AppWindow>
  );
}
