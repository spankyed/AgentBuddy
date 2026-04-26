/**
 * Codex OpenAI client — public API.
 *
 * Provides a typed interface for streaming Chat Completions requests to
 * OpenAI's API, replicating the Codex CLI's wire protocol. Uses raw
 * fetch() + SSE parsing instead of any SDK wrapper.
 */

export { streamChatCompletions } from './stream'
export type { StreamRequestOptions, StreamHandle } from './stream'
export type {
  ChatMessage,
  ToolCall,
  ToolDefinition,
  JsonSchema,
  CodexStreamEvent,
  CodexCompletedResult,
  TokenUsage,
} from './types'
