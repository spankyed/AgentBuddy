import type {CSSProperties, ReactNode} from 'react';
import {MarkdownViewer} from './MarkdownViewer';
import {MessageBubble} from './MessageBubble';
import {PlanArtifactCard} from './PlanArtifactCard';
import {ThreadChatCanvas} from './ThreadChatCanvas';
import {ToolActivityBlock} from './ToolActivityBlock';
import type {PlanArtifactState, ToolActivityBlockState} from './threadTypes';

type ThreadConversationProps = {
  assistant: {
    artifact?: PlanArtifactState;
    markdown: string;
    toolActivity?: {
      rowOpacities?: number[];
      state: ToolActivityBlockState;
    };
  };
  children?: ReactNode;
  createdAt?: string;
  messageStyles?: {
    assistant?: CSSProperties;
    system?: CSSProperties;
    user?: CSSProperties;
  };
  systemMessage?: ReactNode;
  userMessage: ReactNode;
};

// Reusable thread conversation surface for app-like scenes. Film shots provide
// frame-derived text/cursor overlays; message rendering stays here.
export function ThreadConversation({assistant, children, createdAt, messageStyles, systemMessage, userMessage}: ThreadConversationProps) {
  const hasAssistantContent = Boolean(assistant.toolActivity || assistant.artifact || assistant.markdown.trim());
  return (
    <ThreadChatCanvas>
      {systemMessage ? <div style={messageStyles?.system}><MessageBubble sender="system">{systemMessage}</MessageBubble></div> : null}
      <div style={messageStyles?.user}><MessageBubble sender="user" createdAt={createdAt} isTail>{userMessage}</MessageBubble></div>
      {hasAssistantContent ? (
        <div style={messageStyles?.assistant}>
          <MessageBubble sender="assistant" createdAt={createdAt}>
            {assistant.toolActivity ? <ToolActivityBlock rowOpacities={assistant.toolActivity.rowOpacities} state={assistant.toolActivity.state} /> : null}
            {assistant.markdown.trim() ? <MarkdownViewer content={assistant.markdown} /> : null}
            {assistant.artifact ? <PlanArtifactCard artifact={assistant.artifact} /> : null}
          </MessageBubble>
        </div>
      ) : null}
      {children}
    </ThreadChatCanvas>
  );
}
