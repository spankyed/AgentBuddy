import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {ThreadConversation} from '../../agentbuddy-ui/threads/ThreadConversation';
import {Cursor} from '../overlays/Cursor';
import {chatShotState, chatViewForFrame, launchComposerState, launchPlanArtifact} from '../state/chat';
import {Caret} from './Caret';
import {useAppWindowLayout} from '../appWindowLayout';

export function ChatShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = chatViewForFrame(frame);
  const layout = useAppWindowLayout({variant});
  return (
    <AppWindow activePlugin="threads" breadcrumbs={chatShotState.breadcrumbs} composer={launchComposerState} layout={layout}>
      <ThreadConversation
        assistant={{
          artifact: launchPlanArtifact,
          markdown: view.response,
          toolActivity: view.toolActivity,
        }}
        createdAt={chatShotState.createdAt}
        systemMessage={chatShotState.systemMessage}
        userMessage={<>{view.prompt}<Caret frame={frame} visible={view.promptCaretVisible} /></>}
      >
        <Cursor frame={frame} {...chatShotState.cursorPath} />
      </ThreadConversation>
    </AppWindow>
  );
}
