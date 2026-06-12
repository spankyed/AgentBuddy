import {AppWindow} from '../../../agentbuddy-ui/chrome/AppWindow';
import {ChatComposer} from '../../../agentbuddy-ui/chat/ChatComposer';
import type {ChatComposerInlineNode} from '../../../agentbuddy-ui/chat/chatTypes';
import {EmptyThreadQuote} from '../../../agentbuddy-ui/threads/EmptyThreadQuote';
import {ReferencePill} from '../../../agentbuddy-ui/chat/ReferencePill';
import {ThreadConversation} from '../../../agentbuddy-ui/threads/ThreadConversation';
import {TextCaret} from '../../../agentbuddy-ui/primitives/TextCaret';
import {Cursor} from '../../overlays/Cursor';
import {chatShotViewForFrame} from '../../state/chat';
import {useAppWindowLayout} from '../../appWindowLayout';
import {ease, mix} from '../../state/timeline';
import {cursorTimeline, viewportPoint} from '../../interaction/cursorTargets';
import type {CursorPath, TargetRect} from '../../interaction/cursorTargets';
import {useVideoConfig} from 'remotion';
import '../../shots/ChatShot.module.css';
import {makeStyles} from '../../../agentbuddy-ui/primitives/makeStyles';

const styles = makeStyles('ChatShot');
const bottomTabsHeight = 38;
const composerInputHeight = 112;
const composerEditorInsetLeft = 16;
const composerEditorInsetTop = 12;
const referencePopupAboveCursorOffset = 4;

type ChatTargetId =
  | 'approvePlanPrimary'
  | 'quickPromptFirst'
  | 'quickPromptsButton'
  | 'quickPromptSend'
  | 'recentThreadRowFirst'
  | 'recentThreads'
  | 'sendButton';

// The full app is on screen from frame 0: the chrome reveal and composer
// dock animation from the source shot are pinned to their final state, so
// the prompt types directly in the docked composer.
export function SimpleChatScene({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = chatShotViewForFrame(frame);
  const layout = useAppWindowLayout({animate: false, variant});
  const {height, width} = useVideoConfig();
  const composerRect = composerPlacement({height, layout, variant, width});
  const composer = withPopupPositions(view.composer, composerRect, height);
  const targets = chatTargetsForFrame({composerRect, height, layout, variant, width});
  const cursorPath = chatCursorForFrame(frame, targets, width, height);
  const quote = emptyThreadQuoteForFrame(frame, layout, variant);

  return (
    <div className={styles.root}>
      <div className={styles.appReveal}>
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
                      <TextCaret frame={frame} visible={view.conversation.userMessage.caretVisible} />
                    </p>
                  </div>
                </div>
              }
            >
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
          transform: 'translate(-50%, -100%)',
        }}
      >
        <ChatComposer formStyle={{width: '100%'}} state={composer} />
      </div>
      {quote ? <EmptyThreadQuote style={quote.style} text={quote.text} /> : null}
      {cursorPath ? <Cursor frame={frame} {...cursorPath} /> : null}
    </div>
  );
}

function withPopupPositions(
  composer: ReturnType<typeof chatShotViewForFrame>['composer'],
  rect: ReturnType<typeof composerPlacement>,
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
                  bottom: viewportHeight - (composerInputTop(rect, Boolean(composer.bottomTabs)) + composerInputHeight - 12),
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
  hasBottomTabs: boolean,
  rect: ReturnType<typeof composerPlacement>,
  viewportHeight: number,
) {
  const composerLeft = rect.left - rect.width / 2;
  const composerTop = composerInputTop(rect, hasBottomTabs);
  const clampedAnchor = Math.min(Math.max(anchorCharacterIndex, 0), 36);
  return {
    bottom: viewportHeight - (composerTop + composerEditorInsetTop) + 4,
    left: composerLeft + composerEditorInsetLeft + estimatedInlineTextWidth(anchorText, clampedAnchor),
  };
}

function revertHistoryPopupPlacement(
  rect: ReturnType<typeof composerPlacement>,
  hasBottomTabs: boolean,
  viewportHeight: number,
) {
  const composerLeft = rect.left - rect.width / 2;
  const composerTop = composerInputTop(rect, hasBottomTabs);
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
  hasBottomTabs: boolean,
  rect: ReturnType<typeof composerPlacement>,
  viewportHeight: number,
) {
  const composerLeft = rect.left - rect.width / 2;
  const composerTop = composerInputTop(rect, hasBottomTabs);
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
  hasBottomTabs: boolean,
) {
  const composerHeight = composerInputHeight + (hasBottomTabs ? bottomTabsHeight : 0);
  return rect.top - composerHeight;
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

function chatCursorForFrame(frame: number, targets: Record<ChatTargetId, TargetRect>, width: number, height: number): CursorPath | null {
  return cursorTimeline(targets, [
    {
      end: 264,
      from: viewportPoint(width, height, 0.52, 0.53),
      start: 236,
      to: 'sendButton',
    },
    {
      click: false,
      end: 396,
      from: 'sendButton',
      start: 370,
      to: 'approvePlanPrimary',
      toPoint: {anchor: [0.42, 0.5]},
    },
    {
      end: 414,
      from: 'approvePlanPrimary',
      fromPoint: {anchor: [0.42, 0.5]},
      start: 400,
      to: 'approvePlanPrimary',
      toPoint: {anchor: [0.42, 0.5]},
    },
    {
      end: 454,
      from: 'approvePlanPrimary',
      fromPoint: {anchor: [0.42, 0.5]},
      start: 424,
      to: 'recentThreads',
      toPoint: {anchor: [0.42, 0.5]},
    },
    {
      click: false,
      end: 482,
      from: 'recentThreads',
      fromPoint: {anchor: [0.42, 0.5]},
      start: 462,
      to: 'recentThreadRowFirst',
      toPoint: {anchor: [0.14, 0.68]},
    },
    {
      click: false,
      end: 506,
      from: 'recentThreadRowFirst',
      fromPoint: {anchor: [0.14, 0.68]},
      start: 486,
      to: 'recentThreadRowFirst',
      toPoint: {anchor: [0.14, 0.68]},
    },
    {
      end: 526,
      from: 'recentThreadRowFirst',
      fromPoint: {anchor: [0.14, 0.68]},
      start: 508,
      to: 'recentThreadRowFirst',
      toPoint: {anchor: [0.14, 0.68]},
    },
    {
      end: 550,
      from: 'recentThreadRowFirst',
      fromPoint: {anchor: [0.14, 0.68]},
      start: 540,
      to: 'quickPromptsButton',
    },
    {
      click: false,
      end: 570,
      from: 'quickPromptsButton',
      start: 554,
      to: 'quickPromptFirst',
      toPoint: {anchor: [0.25, 0.5]},
    },
    {
      end: 586,
      from: 'quickPromptFirst',
      fromPoint: {anchor: [0.25, 0.5]},
      start: 574,
      to: 'quickPromptFirst',
      toPoint: {anchor: [0.25, 0.5]},
    },
    {
      end: 624,
      from: 'quickPromptFirst',
      fromPoint: {anchor: [0.25, 0.5]},
      start: 604,
      to: 'quickPromptSend',
    },
  ], frame);
}

function chatTargetsForFrame({
  composerRect,
  height,
  layout,
  variant,
  width,
}: {
  composerRect: ReturnType<typeof composerPlacement>;
  height: number;
  layout: ReturnType<typeof useAppWindowLayout>;
  variant?: 'landscape' | 'square';
  width: number;
}): Record<ChatTargetId, TargetRect> {
  const bottomTabs = bottomTabsPlacement(composerRect, height);
  const composerLeft = composerRect.left - composerRect.width / 2;
  const composerTop = composerInputTop(composerRect, true);
  const inputWidth = composerRect.width;
  const actionBarTop = composerTop + composerInputHeight - 44;
  const actionButtonTop = actionBarTop + 2;
  const actionButtonSize = 32;
  const quickPromptButtonLeft = composerLeft + 88;
  const quickPromptMenuTop = actionBarTop - 154;
  const sendWidth = 92;
  const sendHeight = 32;
  const bottomButtonHeight = 28;
  const bottomButtonTop = bottomTabs.top + 8;
  const recentButtonWidth = 160;
  const recentMenuTop = composerTop + composerInputHeight - 12 - 116;
  const windowLeft = Number(layout.windowStyle.left ?? 0);
  const windowTop = Number(layout.windowStyle.top ?? 0);
  const windowWidth = Number(layout.windowStyle.width ?? width);
  const windowHeight = Number(layout.windowStyle.height ?? height);
  const mainLeft = windowLeft + 72;
  const mainTop = windowTop + 42;
  const mainWidth = windowWidth - 72;
  const mainHeight = windowHeight - 42 - composerInputHeight - bottomTabsHeight - (variant === 'square' ? 34 : 28);

  return {
    approvePlanPrimary: {
      height: 32,
      left: mainLeft + mainWidth * 0.145,
      top: mainTop + mainHeight * 0.915,
      width: 280,
    },
    quickPromptFirst: {
      height: 36,
      left: quickPromptButtonLeft + actionButtonSize / 2 - 128,
      top: quickPromptMenuTop + 38,
      width: 256,
    },
    quickPromptsButton: {
      height: actionButtonSize,
      left: quickPromptButtonLeft,
      top: actionButtonTop,
      width: actionButtonSize,
    },
    quickPromptSend: {
      height: sendHeight,
      left: composerLeft + inputWidth - sendWidth - 16,
      top: actionBarTop,
      width: sendWidth,
    },
    recentThreadRowFirst: {
      height: 34,
      left: bottomTabs.left,
      top: recentMenuTop - 22,
      width: bottomTabs.width,
    },
    recentThreads: {
      height: bottomButtonHeight,
      left: bottomTabs.left,
      top: bottomButtonTop,
      width: recentButtonWidth,
    },
    sendButton: {
      height: sendHeight,
      left: composerLeft + inputWidth - sendWidth - 16,
      top: actionBarTop,
      width: sendWidth,
    },
  };
}

function emptyThreadQuoteForFrame(
  frame: number,
  layout: ReturnType<typeof useAppWindowLayout>,
  variant?: 'landscape' | 'square',
) {
  const enter = ease(frame, 0, 12);
  if (frame >= 210) return null;

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
      opacity: enter,
      top: mainTop + mainHeight * 0.48,
      transform: `translateY(${mix(8, 0, enter)}px)`,
      width: mainWidth,
    },
    text: '"Every creator gets paid. Every buyer gets a receipt."',
  };
}

function composerPlacement({
  height,
  layout,
  variant,
  width,
}: {
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

  return {
    left: mainLeft + mainWidth / 2,
    top: windowTop + windowHeight - (variant === 'square' ? 20 : 18),
    width: Math.min(mainWidth * 0.8, 1060),
  };
}
