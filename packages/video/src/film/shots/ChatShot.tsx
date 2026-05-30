import type {ReactNode} from 'react';
import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {ChatComposer} from '../../agentbuddy-ui/chat/ChatComposer';
import type {ChatComposerInlineNode} from '../../agentbuddy-ui/chat/chatTypes';
import {EmptyThreadQuote} from '../../agentbuddy-ui/threads/EmptyThreadQuote';
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
const bottomTabsHeight = 38;
const composerInputHeight = 112;
const composerEditorInsetLeft = 16;
const composerEditorInsetTop = 12;
const referencePopupAboveCursorOffset = 4;

export function ChatShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = chatShotViewForFrame(frame);
  const layout = useAppWindowLayout({variant});
  const {height, width} = useVideoConfig();
  const appReveal = ease(frame, 58, 112);
  const composerDock = ease(frame, 50, 122);
  const composerRect = composerPlacement({dock: composerDock, height, layout, variant, width});
  const composer = withPopupPositions(view.composer, composerRect, composerDock, height);
  const initialCursor = initialChatCursorForFrame(frame);
  const quote = emptyThreadQuoteForFrame(frame, layout, variant);

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
              additionalAssistantMessages={view.conversation.additionalAssistantMessages}
              assistant={view.conversation.assistant}
              createdAt={view.conversation.createdAt}
              messageStyles={view.messageStyles}
              systemMessage={view.conversation.systemMessage}
              userMessage={
                <div className={`${styles.viewerWrapper} tiptap-wrapper tiptap-viewer tiptap-viewer-chat`}>
                  <div className={`${styles.viewerProse} ProseMirror`} contentEditable={false}>
                    <p>
                      {formatUserMessage(view.conversation.userMessage.text, view.conversation.userMessage.content)}
                      <Caret frame={frame} visible={view.conversation.userMessage.caretVisible} />
                    </p>
                  </div>
                </div>
              }
            >
              {view.cursorPath ? <Cursor frame={frame} {...view.cursorPath} /> : null}
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
        <ChatComposer formStyle={{width: '100%'}} state={composer} />
      </div>
      {quote ? <EmptyThreadQuote style={quote.style} text={quote.text} /> : null}
      {initialCursor ? <Cursor frame={frame} {...initialCursor} /> : null}
    </div>
  );
}

function withPopupPositions(
  composer: ReturnType<typeof chatShotViewForFrame>['composer'],
  rect: ReturnType<typeof composerPlacement>,
  dock: number,
  viewportHeight: number,
) {
  const bottomTabsRect = bottomTabsPlacement(rect, viewportHeight);
  const newThreadMenu = composer.bottomTabs?.newThreadMenu
    ? {
        ...composer.bottomTabs.newThreadMenu,
        popupPosition: composer.bottomTabs.newThreadMenu.popupPosition ?? newThreadMenuPlacement(bottomTabsRect),
      }
    : undefined;
  const referenceAutocomplete = composer.referenceAutocomplete
    ? {
        ...composer.referenceAutocomplete,
        popupPosition: composer.referenceAutocomplete.popupPosition ?? referencePopupPlacement(
          composer.referenceAutocomplete.anchorCharacterIndex,
          textBeforeAnchor(composer, composer.referenceAutocomplete.anchorCharacterIndex),
          dock,
          Boolean(composer.bottomTabs),
          rect,
          viewportHeight,
        ),
      }
    : undefined;
  const commandSuggestion = composer.commandSuggestion
    ? {
        ...composer.commandSuggestion,
        popupPosition: composer.commandSuggestion.popupPosition ?? commandSuggestionPopupPlacement(
          composer.commandSuggestion.anchorCharacterIndex ?? 0,
          textBeforeAnchor(composer, composer.commandSuggestion.anchorCharacterIndex ?? 0),
          dock,
          Boolean(composer.bottomTabs),
          rect,
          viewportHeight,
        ),
      }
    : undefined;
  const revertHistory = composer.revertHistory
    ? {
        ...composer.revertHistory,
        popupPosition: composer.revertHistory.popupPosition ?? revertHistoryPopupPlacement(
          rect,
          dock,
          Boolean(composer.bottomTabs),
          viewportHeight,
        ),
      }
    : undefined;

  return {
    ...composer,
    commandSuggestion,
    referenceAutocomplete,
    revertHistory,
    bottomTabs: composer.bottomTabs
      ? {
          ...composer.bottomTabs,
          newThreadMenu,
          recentThreadsMenu: composer.bottomTabs.recentThreadsMenu
            ? {
                ...composer.bottomTabs.recentThreadsMenu,
                popupPosition: composer.bottomTabs.recentThreadsMenu.popupPosition ?? {
                  bottom: viewportHeight - composerInputTop(rect, dock, Boolean(composer.bottomTabs)) + 8,
                  left: bottomTabsRect.left,
                  width: bottomTabsRect.width,
                },
              }
            : undefined,
        }
      : undefined,
  };
}

function commandSuggestionPopupPlacement(
  anchorCharacterIndex: number,
  anchorText: string,
  dock: number,
  hasBottomTabs: boolean,
  rect: ReturnType<typeof composerPlacement>,
  viewportHeight: number,
) {
  const composerLeft = rect.left - rect.width / 2;
  const composerTop = composerInputTop(rect, dock, hasBottomTabs);
  const clampedAnchor = Math.min(Math.max(anchorCharacterIndex, 0), 36);
  return {
    bottom: viewportHeight - (composerTop + composerEditorInsetTop) + 4,
    left: composerLeft + composerEditorInsetLeft + estimatedInlineTextWidth(anchorText, clampedAnchor),
  };
}

function revertHistoryPopupPlacement(
  rect: ReturnType<typeof composerPlacement>,
  dock: number,
  hasBottomTabs: boolean,
  viewportHeight: number,
) {
  const composerLeft = rect.left - rect.width / 2;
  const composerTop = composerInputTop(rect, dock, hasBottomTabs);
  return {
    bottom: viewportHeight - composerTop + 6,
    left: composerLeft,
    maxWidth: Math.max(260, Math.min(rect.width, 520)),
  };
}

function newThreadMenuPlacement(rect: ReturnType<typeof bottomTabsPlacement>) {
  return {
    bottom: rect.bottom + 8,
    left: rect.left + rect.width - 184,
    top: rect.top - 90,
  };
}

function referencePopupPlacement(
  anchorCharacterIndex: number,
  anchorText: string,
  dock: number,
  hasBottomTabs: boolean,
  rect: ReturnType<typeof composerPlacement>,
  viewportHeight: number,
) {
  const composerLeft = rect.left - rect.width / 2;
  const composerTop = composerInputTop(rect, dock, hasBottomTabs);
  const clampedAnchor = Math.min(Math.max(anchorCharacterIndex, 0), 36);
  return {
    bottom: viewportHeight - (composerTop + composerEditorInsetTop) + referencePopupAboveCursorOffset,
    left: composerLeft + composerEditorInsetLeft + estimatedInlineTextWidth(anchorText, clampedAnchor),
  };
}

function textBeforeAnchor(
  composer: ReturnType<typeof chatShotViewForFrame>['composer'],
  anchorCharacterIndex: number,
) {
  return composer.text?.slice(0, anchorCharacterIndex) ?? '';
}

function estimatedInlineTextWidth(text: string, fallbackCharacters: number) {
  if (!text) return fallbackCharacters * 7.3;
  return text.split('').reduce((width, character) => {
    if (character === ' ') return width + 3.9;
    if ('il.,:;!|'.includes(character)) return width + 3.8;
    if ('mwMW@#'.includes(character)) return width + 12;
    if (/[A-Z]/.test(character)) return width + 9.2;
    if (/[0-9]/.test(character)) return width + 8;
    return width + 7.3;
  }, 0);
}

function composerInputTop(
  rect: ReturnType<typeof composerPlacement>,
  dock: number,
  hasBottomTabs: boolean,
) {
  const composerHeight = composerInputHeight + (hasBottomTabs ? bottomTabsHeight : 0);
  const translateYRatio = mix(0.5, 1, dock);
  return rect.top - composerHeight * translateYRatio;
}

function bottomTabsPlacement(rect: ReturnType<typeof composerPlacement>, viewportHeight: number) {
  const width = rect.width * 0.8;
  const top = rect.top - bottomTabsHeight;
  return {
    left: rect.left - width / 2,
    bottom: viewportHeight - top,
    top,
    width,
  };
}

function formatUserMessage(
  text: string,
  content: ChatComposerInlineNode[] | undefined,
) {
  if (!content?.length) return <>{text}</>;
  return (
    <>
      {content.map((node, index) => {
        if (node.type === 'text') return <span key={`text-${index}`}>{node.text}</span>;
        return <ReferencePill key={node.refId} label={node.label} refType={node.refType} />;
      })}
    </>
  );
}

function initialChatCursorForFrame(frame: number):
  | {end: number; from: [number, number]; start: number; to: [number, number]}
  | null {
  if (frame >= 24 && frame < 62) {
    return {end: 58, from: [52, 53], start: 24, to: [75.5, 61.2]};
  }

  if (frame >= 138 && frame < 174) {
    return {end: 166, from: [74, 55.5], start: 138, to: [82, 87]};
  }

  if (frame >= 314 && frame < 348) {
    return {end: 344, from: [26, 92], start: 314, to: [31, 66]};
  }

  if (frame >= 410 && frame < 438) {
    return {end: 436, from: [22, 73], start: 410, to: [86, 86]};
  }

  return null;
}

function emptyThreadQuoteForFrame(
  frame: number,
  layout: ReturnType<typeof useAppWindowLayout>,
  variant?: 'landscape' | 'square',
) {
  const enter = ease(frame, 64, 80);
  const exit = ease(frame, 166, 178);
  const opacity = Math.min(enter, 1 - exit);
  if (opacity <= 0) return null;

  const windowLeft = Number(layout.windowStyle.left ?? 0);
  const windowTop = Number(layout.windowStyle.top ?? 0);
  const windowWidth = Number(layout.windowStyle.width ?? 1440);
  const windowHeight = Number(layout.windowStyle.height ?? 900);
  const mainLeft = windowLeft + 72;
  const mainTop = windowTop + 42;
  const mainWidth = windowWidth - 72;
  const mainHeight = windowHeight - 42 - composerInputHeight - bottomTabsHeight - (variant === 'square' ? 34 : 28);

  return {
    style: {
      left: mainLeft,
      opacity,
      top: mainTop + mainHeight * 0.48,
      transform: `translateY(${mix(8, 0, enter) - exit * 6}px)`,
      width: mainWidth,
    },
    text: '"My therapist says I have attachment issues. I say I have context windows."',
  };
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
