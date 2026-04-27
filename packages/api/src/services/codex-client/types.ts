/**
 * Wire protocol types for the OpenAI Chat Completions & Responses APIs.
 *
 * Ported from Codex's Rust implementation:
 *   codex-rs/core/src/chat_completions.rs
 *   codex-rs/core/src/client.rs
 *   codex-rs/core/src/client_common.rs
 *   codex-rs/core/src/openai_tools.rs
 *   codex-rs/protocol/src/models.rs
 */

// ─── Chat Completions message format ────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

// ─── Tool definitions (Chat Completions format) ────────────────────────────

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: JsonSchema
  }
}

export interface JsonSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array'
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  required?: string[]
  additionalProperties?: boolean
  description?: string
}

// ─── Stream events (mapped from SSE deltas) ────────────────────────────────

export type CodexStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call_delta'; index: number; toolCallId?: string; name?: string; arguments: string }
  | { type: 'tool_call_done'; toolCall: ToolCall }
  | { type: 'message_done'; content: string; toolCalls: ToolCall[]; finishReason: string }
  | { type: 'error'; message: string }

// ─── Completed result ──────────────────────────────────────────────────────

export interface CodexCompletedResult {
  content: string
  toolCalls: ToolCall[]
  usage?: TokenUsage
  finishReason: string
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

// ─── SSE chunk shape from OpenAI ───────────────────────────────────────────

export interface ChatCompletionChunk {
  id: string
  object: string
  created: number
  model: string
  choices: ChatCompletionChoice[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface ChatCompletionChoice {
  index: number
  delta: {
    role?: string
    content?: string | null
    tool_calls?: ChunkToolCall[]
    reasoning?: string | null
  }
  finish_reason: string | null
}

export interface ChunkToolCall {
  index: number
  id?: string
  type?: string
  function?: {
    name?: string
    arguments?: string
  }
}

// ─── Responses API types (chatgpt.com/backend-api/codex) ────────────────────

/** Input item for the Responses API (codex-rs/protocol/src/models.rs) */
export type ResponsesInputItem =
  | { type: 'message'; role: string; content: ResponsesContentItem[] }
  | { type: 'function_call'; name: string; arguments: string; call_id: string }
  | { type: 'function_call_output'; call_id: string; output: string }

export interface ResponsesContentItem {
  type: 'input_text' | 'output_text'
  text: string
}

/** Tool definition for the Responses API (flat format, NOT nested under "function") */
export interface ResponsesToolDefinition {
  type: 'function'
  name: string
  description: string
  parameters: JsonSchema
  strict: boolean
}

/** SSE event from the Responses API (codex-rs/core/src/client.rs:487-626) */
export interface ResponsesSseEvent {
  type: string
  delta?: string
  item?: any
  response?: any
}
