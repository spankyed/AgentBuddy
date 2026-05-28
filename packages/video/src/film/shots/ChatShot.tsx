import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {ChatComposer} from '../../agentbuddy-ui/chat/ChatComposer';
import {ReferencePill} from '../../agentbuddy-ui/chat/ReferencePill';
import {ThreadConversation} from '../../agentbuddy-ui/threads/ThreadConversation';
import {Cursor} from '../overlays/Cursor';
import {chatShotViewForFrame} from '../state/chat';
import {Caret} from './Caret';
import {useAppWindowLayout} from '../appWindowLayout';
import {ease, mix} from '../state/timeline';
import {useVideoConfig} from 'remotion';
import './ChatShot.module.css';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';

const styles = makeStyles('ChatShot');

export function ChatShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = chatShotViewForFrame(frame);
  const layout = useAppWindowLayout({variant});
  const {height, width} = useVideoConfig();
  const appReveal = ease(frame, 58, 112);
  const composerDock = ease(frame, 50, 122);
  const composerRect = composerPlacement({dock: composerDock, height, layout, variant, width});
  const initialCursor = initialChatCursorForFrame(frame);

  return (
    <div className={styles.root}>
      <div
        className={styles.appReveal}
        style={{
          opacity: appReveal,
          transform: `translateY(${mix(22, 0, appReveal)}px) scale(${mix(0.99, 1, appReveal)})`,
        }}
      >
        <AppWindow activePlugin="threads" breadcrumbs={view.breadcrumbs} composer={false} layout={layout}>
          <div style={{height: '100%', ...view.conversationStyle}}>
            <ThreadConversation
              assistant={view.conversation.assistant}
              createdAt={view.conversation.createdAt}
              messageStyles={view.messageStyles}
              systemMessage={view.conversation.systemMessage}
              userMessage={<>{formatUserMessage(view.conversation.userMessage.text)}<Caret frame={frame} visible={view.conversation.userMessage.caretVisible} /></>}
            >
              <Cursor frame={frame} {...view.cursorPath} />
            </ThreadConversation>
          </div>
        </AppWindow>
      </div>
      <div
        className={styles.composerMotion}
        style={{
          left: composerRect.left,
          top: composerRect.top,
          width: composerRect.width,
          transform: `translate(-50%, ${mix(-50, -100, composerDock)}%) scale(${mix(1.04, 1, composerDock)})`,
        }}
      >
        <ChatComposer formStyle={{width: '100%'}} state={view.composer} />
      </div>
      {initialCursor ? <Cursor frame={frame} {...initialCursor} /> : null}
    </div>
  );
}

function formatUserMessage(text: string) {
  const token = '#notes:current';
  const tokenIndex = text.indexOf(token);
  if (tokenIndex === -1) return text;

  return (
    <>
      {text.slice(0, tokenIndex)}
      <ReferencePill label="current" refType="note" />
      {text.slice(tokenIndex + token.length)}
    </>
  );
}

function initialChatCursorForFrame(frame: number):
  | {end: number; from: [number, number]; start: number; to: [number, number]}
  | null {
  if (frame >= 24 && frame < 54) {
    return {end: 54, from: [52, 53], start: 24, to: [82, 59]};
  }

  if (frame >= 138 && frame < 166) {
    return {end: 166, from: [82, 59], start: 138, to: [82, 87]};
  }

  if (frame >= 410 && frame < 438) {
    return {end: 432, from: [84, 86], start: 410, to: [49, 94]};
  }

  return null;
}

function composerPlacement({
  dock,
  height,
  layout,
  variant,
  width,
}: {
  dock: number;
  height: number;
  layout: ReturnType<typeof useAppWindowLayout>;
  variant?: 'landscape' | 'square';
  width: number;
}) {
  const windowLeft = Number(layout.windowStyle.left ?? 0);
  const windowTop = Number(layout.windowStyle.top ?? 0);
  const windowWidth = Number(layout.windowStyle.width ?? width);
  const windowHeight = Number(layout.windowStyle.height ?? height);
  const mainLeft = windowLeft + 72;
  const mainWidth = windowWidth - 72;
  const finalWidth = Math.min(mainWidth * 0.8, 1060);
  const startWidth = variant === 'square' ? Math.min(720, width - 96) : Math.min(960, width - 160);
  const finalCenterX = mainLeft + mainWidth / 2;
  const finalBottomY = windowTop + windowHeight - (variant === 'square' ? 20 : 18);

  return {
    left: mix(width / 2, finalCenterX, dock),
    top: mix(height / 2, finalBottomY, dock),
    width: mix(startWidth, finalWidth, dock),
  };
}
