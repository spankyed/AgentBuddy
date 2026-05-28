import type {CSSProperties, ReactNode} from 'react';
import {ApprovalBlock} from './ApprovalBlock';
import {MarkdownViewer} from './MarkdownViewer';
import {MarkdownBlock} from './MarkdownBlock';
import {MessageBubble} from './MessageBubble';
import {PlanArtifactCard} from './PlanArtifactCard';
import {ThinkingBlock} from './ThinkingBlock';
import {ThreadChatCanvas} from './ThreadChatCanvas';
import {ToolActivityBlock} from './ToolActivityBlock';
import type {ApprovalBlockState, MarkdownBlockState, PlanArtifactState, ThinkingBlockState, ToolActivityBlockState} from './threadTypes';
import {makeStyles} from '../primitives/makeStyles';
import './ThreadConversation.module.css';

const styles = makeStyles('ThreadConversation');

type ThreadConversationProps = {
  assistant: {
    approval?: ApprovalBlockState;
    artifact?: PlanArtifactState;
    markdown: string;
    markdownBlock?: MarkdownBlockState;
    thinking?: ThinkingBlockState;
    toolActivity?: {
      rowOpacities?: number[];
      state: ToolActivityBlockState;
    };
  };
  children?: ReactNode;
  createdAt?: number | string;
  messageStyles?: {
    assistant?: CSSProperties;
    system?: CSSProperties;
    user?: CSSProperties;
  };
  systemMessage?: ReactNode;
  topInset?: number;
  userMessage: ReactNode;
};

// Reusable thread conversation surface for app-like scenes. Film shots provide
// frame-derived text/cursor overlays; message rendering stays here.
export function ThreadConversation({assistant, children, createdAt, messageStyles, systemMessage, topInset = 0, userMessage}: ThreadConversationProps) {
  const hasAssistantContent = Boolean(assistant.toolActivity || assistant.artifact || assistant.markdown.trim() || assistant.markdownBlock || assistant.approval || assistant.thinking);
  const hasInteractionBlocks = Boolean(assistant.markdownBlock || assistant.approval || assistant.thinking || assistant.artifact);
  return (
    <ThreadChatCanvas>
      {topInset > 0 ? <div style={{height: topInset}} /> : null}
      {systemMessage ? <div style={messageStyles?.system}><MessageBubble sender="system">{systemMessage}</MessageBubble></div> : null}
      <div style={messageStyles?.user}><MessageBubble sender="user" createdAt={createdAt} isTail>{userMessage}</MessageBubble></div>
      {hasAssistantContent ? (
        <div style={messageStyles?.assistant}>
          <MessageBubble sender="assistant" createdAt={createdAt}>
            {assistant.toolActivity ? (
              <div className={styles.toolBlocks}>
                <ToolActivityBlock rowOpacities={assistant.toolActivity.rowOpacities} state={assistant.toolActivity.state} />
              </div>
            ) : null}
            {assistant.markdown.trim() ? <MarkdownViewer content={assistant.markdown} /> : null}
            {hasInteractionBlocks ? (
              <div className={styles.interactionBlocks}>
                {assistant.markdownBlock ? <MarkdownBlock state={assistant.markdownBlock} /> : null}
                {assistant.approval ? <ApprovalBlock state={assistant.approval} /> : null}
                {assistant.thinking ? <ThinkingBlock state={assistant.thinking} /> : null}
                {assistant.artifact ? <PlanArtifactCard artifact={assistant.artifact} /> : null}
              </div>
            ) : null}
          </MessageBubble>
        </div>
      ) : null}
      {children}
    </ThreadChatCanvas>
  );
}
