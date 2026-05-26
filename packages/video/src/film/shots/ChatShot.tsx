import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {ChatComposer} from '../../agentbuddy-ui/chat/ChatComposer';
import {ThreadConversation} from '../../agentbuddy-ui/threads/ThreadConversation';
import {Cursor} from '../overlays/Cursor';
import {chatShotViewForFrame} from '../state/chat';
import {Caret} from './Caret';
import {useAppWindowLayout} from '../appWindowLayout';
import {ease, mix} from '../state/timeline';
import './ChatShot.module.css';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';

const styles = makeStyles('ChatShot');

export function ChatShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = chatShotViewForFrame(frame);
  const layout = useAppWindowLayout({variant});
  const appReveal = ease(frame, 42, 78);

  if (frame < 42) {
    return (
      <div className={`${styles.isolatedComposer} ${variant === 'square' ? styles.square : ''}`}>
        <ChatComposer state={view.composer} />
      </div>
    );
  }

  return (
    <div
      className={styles.appReveal}
      style={{
        opacity: appReveal,
        transform: `translateY(${mix(-28, 0, appReveal)}px) scale(${mix(0.986, 1, appReveal)})`,
      }}
    >
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
    </div>
  );
}
