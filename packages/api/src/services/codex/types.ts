/**
 * Type definitions for the Codex CLI wrapper service.
 *
 * Re-exports SDK types and defines the service-specific handle/options shapes.
 */

export type {
  ThreadEvent,
  ThreadStartedEvent,
  TurnStartedEvent,
  TurnCompletedEvent,
  TurnFailedEvent,
  ItemStartedEvent,
  ItemUpdatedEvent,
  ItemCompletedEvent,
  ThreadErrorEvent,
  ThreadError,
  Usage,
} from '@openai/codex-sdk'

export type {
  ThreadItem,
  AgentMessageItem,
  ReasoningItem,
  CommandExecutionItem,
  FileChangeItem,
  McpToolCallItem,
  WebSearchItem,
  TodoListItem,
  ErrorItem,
} from '@openai/codex-sdk'

export type { ApprovalMode, SandboxMode, ModelReasoningEffort, WebSearchMode } from '@openai/codex-sdk'

export interface CodexQueryOptions {
  /** User prompt text. */
  prompt: string
  /** Working directory for the agent. */
  cwd?: string
  /** Resume an existing Codex thread by ID. */
  threadId?: string
  /** LLM model to use. */
  model?: string
  /** Sandbox policy for command execution. */
  sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access'
  /** Tool approval policy. */
  approvalPolicy?: 'never' | 'on-request' | 'on-failure' | 'untrusted'
  /** Additional directories to include. */
  additionalDirectories?: string[]
  /** Reasoning effort level. */
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
}

export interface CodexHandle {
  /** Async generator of ThreadEvents from the SDK's runStreamed(). */
  events: AsyncGenerator<import('@openai/codex-sdk').ThreadEvent>
  /** Resolves with the Codex thread ID after thread.started event. */
  threadId: Promise<string>
  /** Abort the running turn via AbortController. */
  abort(): void
}
