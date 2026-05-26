import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {ChatComposer} from '../../agentbuddy-ui/chat/ChatComposer';
import {ThreadConversation} from '../../agentbuddy-ui/threads/ThreadConversation';
import {Cursor} from '../overlays/Cursor';
import {chatShotViewForFrame} from '../state/chat';
import {Caret} from './Caret';
import {useAppWindowLayout} from '../appWindowLayout';
import './ChatShot.module.css';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';

const styles = makeStyles('ChatShot');

export function ChatShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = chatShotViewForFrame(frame);
  const layout = useAppWindowLayout({variant});

  if (frame < 42) {
    return (
      <div className={`${styles.isolatedComposer} ${variant === 'square' ? styles.square : ''}`}>
        <ChatComposer state={view.composer} />
      </div>
    );
  }

  return (
    <AppWindow activePlugin="threads" breadcrumbs={view.breadcrumbs} composer={view.composer} layout={layout}>
      <div style={{height: '100%', ...view.conversationStyle}}>
        <ThreadConversation
          assistant={view.conversation.assistant}
          createdAt={view.conversation.createdAt}
          messageStyles={view.messageStyles}
          systemMessage={view.conversation.systemMessage}
          userMessage={<>{view.conversation.userMessage.text}<Caret frame={frame} visible={view.conversation.userMessage.caretVisible} /></>}
        >
          <Cursor frame={frame} {...view.cursorPath} />
        </ThreadConversation>
      </div>
    </AppWindow>
  );
}
