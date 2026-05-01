/**
 * OpenAI Chat Completions streaming client.
 *
 * Ported from Codex's Rust implementation:
 *   codex-rs/core/src/chat_completions.rs — stream_chat_completions() + process_chat_sse()
 *
 * Key behaviors replicated:
 *   - POST to /chat/completions with stream:true
 *   - Parse SSE deltas, accumulate tool call arguments across chunks
 *   - Retry with exponential backoff (max 4 attempts)
 *   - Respect Retry-After header
 *   - Emit typed stream events
 */

import type {
  ChatMessage,
  ToolDefinition,
  ToolCall,
  CodexStreamEvent,
  CodexCompletedResult,
  ChatCompletionChunk,
  TokenUsage,
} from './types'
import type { ResponsesInputItem, ResponsesToolDefinition } from './types'
import { parseSseStream } from './sse-parser'

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_MAX_RETRIES = 4

export interface StreamRequestOptions {
  apiKey: string
  model: string
  baseUrl?: string
  instructions: string
  messages: ChatMessage[]
  tools: ToolDefinition[]
  sessionId?: string
  maxRetries?: number
  signal?: AbortSignal
  /** Extra HTTP headers to include in the request (e.g. chatgpt-account-id). */
  extraHeaders?: Record<string, string>
}

export interface StreamHandle {
  /** Async iterator of stream events. */
  events: AsyncIterable<CodexStreamEvent>
  /** Resolves with the final accumulated result when the stream ends. */
  result: Promise<CodexCompletedResult>
  /** Abort the stream. */
  abort(): void
}

/**
 * Start a streaming Chat Completions request.
 *
 * Returns a handle with an async iterable of events and a promise for the
 * final result (same pattern as Codex's ResponseStream).
 */
export async function streamChatCompletions(opts: StreamRequestOptions): Promise<StreamHandle> {
  const {
    apiKey,
    model,
    baseUrl = DEFAULT_BASE_URL,
    instructions,
    messages,
    tools,
    maxRetries = DEFAULT_MAX_RETRIES,
    signal: externalSignal,
    extraHeaders = {},
  } = opts

  // Build the messages array with system prompt first (same as Codex chat_completions.rs:39-42)
  const apiMessages: any[] = [
    { role: 'system', content: instructions },
    ...messages,
  ]

  const payload = {
    model,
    messages: apiMessages,
    stream: true,
    tools: tools.length > 0 ? tools : undefined,
    tool_choice: tools.length > 0 ? 'auto' : undefined,
    parallel_tool_calls: false,
  }

  const url = `${baseUrl}/chat/completions`

  // Retry loop (port of chat_completions.rs:155-209)
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController()
    // Forward external abort
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort()
      } else {
        externalSignal.addEventListener('abort', () => controller.abort(), { once: true })
      }
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          ...extraHeaders,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      if (res.ok) {
        return createStreamHandle(res, controller)
      }

      // Retryable status codes (same as Codex)
      const status = res.status
      if (status === 429 || status >= 500) {
        const retryAfter = res.headers.get('retry-after')
        const delay = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : backoff(attempt)

        if (attempt < maxRetries) {
          await sleep(delay)
          continue
        }
      }

      // Non-retryable error
      const body = await res.text()
      let errorMsg = `HTTP ${status}`
      try {
        const parsed = JSON.parse(body)
        errorMsg = parsed?.error?.message || parsed?.detail || errorMsg
      } catch { /* use status */ }

      throw new Error(errorMsg)
    } catch (err: any) {
      if (err.name === 'AbortError') throw err
      lastError = err
      if (attempt < maxRetries) {
        await sleep(backoff(attempt))
        continue
      }
    }
  }

  throw lastError || new Error('Max retries exceeded')
}

// ─── Stream processing ──────────────────────────────────────────────────────

function createStreamHandle(
  res: Response,
  controller: AbortController,
): StreamHandle {
  if (!res.body) {
    throw new Error('Response body is null')
  }

  // Accumulated state — mirrors Codex's FunctionCallState
  let assistantText = ''
  const pendingToolCalls = new Map<number, { id: string; name: string; arguments: string }>()
  let finishReason = ''
  let usage: TokenUsage | undefined

  // Channel pattern: events are pushed into a queue, consumed by the async iterator
  const eventQueue: (CodexStreamEvent | null)[] = []
  let resolveWaiting: (() => void) | null = null

  function pushEvent(ev: CodexStreamEvent | null) {
    eventQueue.push(ev)
    if (resolveWaiting) {
      resolveWaiting()
      resolveWaiting = null
    }
  }

  async function waitForEvent(): Promise<CodexStreamEvent | null> {
    if (eventQueue.length > 0) {
      return eventQueue.shift()!
    }
    return new Promise<CodexStreamEvent | null>(resolve => {
      resolveWaiting = () => resolve(eventQueue.shift()!)
    })
  }

  // Result promise
  let resolveResult: (r: CodexCompletedResult) => void
  let rejectResult: (e: Error) => void
  const resultPromise = new Promise<CodexCompletedResult>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })

  // Process SSE in the background (port of process_chat_sse)
  const processPromise = (async () => {
    try {
      for await (const sse of parseSseStream(res.body!, controller.signal)) {
        let chunk: ChatCompletionChunk
        try {
          chunk = JSON.parse(sse.data) as ChatCompletionChunk
        } catch {
          continue // Skip malformed events
        }

        const choice = chunk.choices?.[0]
        if (!choice) {
          // Usage-only chunk (no choices)
          if (chunk.usage) {
            usage = {
              inputTokens: chunk.usage.prompt_tokens,
              outputTokens: chunk.usage.completion_tokens,
              totalTokens: chunk.usage.total_tokens,
            }
          }
          continue
        }

        const delta = choice.delta

        // Text delta (port of chat_completions.rs text delta handling)
        if (delta.content) {
          assistantText += delta.content
          pushEvent({ type: 'text_delta', text: delta.content })
        }

        // Tool call deltas (port of chat_completions.rs FunctionCallState accumulation)
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index
            if (!pendingToolCalls.has(idx)) {
              pendingToolCalls.set(idx, {
                id: tc.id || '',
                name: tc.function?.name || '',
                arguments: '',
              })
            }
            const state = pendingToolCalls.get(idx)!
            if (tc.id) state.id = tc.id
            if (tc.function?.name) state.name = tc.function.name
            if (tc.function?.arguments) {
              state.arguments += tc.function.arguments
              pushEvent({
                type: 'tool_call_delta',
                index: idx,
                toolCallId: state.id || undefined,
                name: state.name || undefined,
                arguments: tc.function.arguments,
              })
            }
          }
        }

        // finish_reason: "tool_calls" signals all tool calls are complete
        if (choice.finish_reason) {
          finishReason = choice.finish_reason
        }

        // Capture usage from choice-bearing chunks too
        if (chunk.usage) {
          usage = {
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          }
        }
      }

      // Stream ended — finalize
      const toolCalls: ToolCall[] = []
      for (const [, tc] of [...pendingToolCalls.entries()].sort((a, b) => a[0] - b[0])) {
        const toolCall: ToolCall = {
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments },
        }
        toolCalls.push(toolCall)
        pushEvent({ type: 'tool_call_done', toolCall })
      }

      pushEvent({
        type: 'message_done',
        content: assistantText,
        toolCalls,
        finishReason,
      })

      // Signal end of events
      pushEvent(null)

      resolveResult!({
        content: assistantText,
        toolCalls,
        usage,
        finishReason,
      })
    } catch (err: any) {
      pushEvent({ type: 'error', message: err.message })
      pushEvent(null)
      rejectResult!(err)
    }
  })()

  // Suppress unhandled rejection on processPromise
  processPromise.catch(() => {})

  const events: AsyncIterable<CodexStreamEvent> = {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<CodexStreamEvent>> {
          const ev = await waitForEvent()
          if (ev === null) return { done: true, value: undefined }
          return { done: false, value: ev }
        },
      }
    },
  }

  return {
    events,
    result: resultPromise,
    abort() { controller.abort() },
  }
}

// ─── Responses API ──────────────────────────────────────────────────────────

/**
 * Start a streaming Responses API request.
 *
 * Used for ChatGPT OAuth authentication where the endpoint is
 * `chatgpt.com/backend-api/codex/responses`.
 *
 * Ported from codex-rs/core/src/client.rs:144-300 (stream_responses)
 */
export async function streamResponses(opts: StreamRequestOptions): Promise<StreamHandle> {
  const {
    apiKey,
    model,
    baseUrl = DEFAULT_BASE_URL,
    instructions,
    messages,
    tools,
    maxRetries = DEFAULT_MAX_RETRIES,
    signal: externalSignal,
    extraHeaders = {},
  } = opts

  // Convert ChatMessage[] to Responses API input format
  const input = convertToResponsesInput(messages)

  // Convert tool definitions to Responses API format (flat, not nested)
  const responsesTools = convertToResponsesTools(tools)

  const sessionId = crypto.randomUUID()

  const payload = {
    model,
    instructions,
    input,
    tools: responsesTools.length > 0 ? responsesTools : undefined,
    tool_choice: responsesTools.length > 0 ? 'auto' : undefined,
    parallel_tool_calls: false,
    store: false,
    stream: true,
  }

  const url = `${baseUrl}/responses`

  let lastError: Error | null = null
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController()
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort()
      } else {
        externalSignal.addEventListener('abort', () => controller.abort(), { once: true })
      }
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'OpenAI-Beta': 'responses=experimental',
          'originator': 'codex_cli_rs',
          'session_id': sessionId,
          ...extraHeaders,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      if (res.ok) {
        return createResponsesStreamHandle(res, controller)
      }

      const status = res.status
      if (status === 429 || status >= 500) {
        const retryAfter = res.headers.get('retry-after')
        const delay = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : backoff(attempt)

        if (attempt < maxRetries) {
          await sleep(delay)
          continue
        }
      }

      const body = await res.text()
      let errorMsg = `HTTP ${status}`
      try {
        const parsed = JSON.parse(body)
        errorMsg = parsed?.error?.message || parsed?.detail || errorMsg
      } catch { /* use status */ }

      throw new Error(errorMsg)
    } catch (err: any) {
      if (err.name === 'AbortError') throw err
      lastError = err
      if (attempt < maxRetries) {
        await sleep(backoff(attempt))
        continue
      }
    }
  }

  throw lastError || new Error('Max retries exceeded')
}

/** Convert ChatMessage[] to Responses API input items. */
function convertToResponsesInput(messages: ChatMessage[]): ResponsesInputItem[] {
  const input: ResponsesInputItem[] = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      // System messages go in the `instructions` field, not input
      continue
    }

    if (msg.role === 'user') {
      input.push({
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: msg.content || '' }],
      })
    } else if (msg.role === 'assistant') {
      // Assistant text → output message
      if (msg.content) {
        input.push({
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: msg.content }],
        })
      }
      // Tool calls → separate function_call items
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          input.push({
            type: 'function_call',
            name: tc.function.name,
            arguments: tc.function.arguments,
            call_id: tc.id,
          })
        }
      }
    } else if (msg.role === 'tool') {
      // Tool result → function_call_output
      input.push({
        type: 'function_call_output',
        call_id: msg.tool_call_id || '',
        output: msg.content || '',
      })
    }
  }

  return input
}

/** Convert Chat Completions tool definitions to Responses API flat format. */
function convertToResponsesTools(tools: ToolDefinition[]): ResponsesToolDefinition[] {
  return tools.map(t => ({
    type: 'function' as const,
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters,
    strict: false,
  }))
}

/**
 * Process SSE events from the Responses API.
 * Port of codex-rs/core/src/client.rs:427-626 (process_sse)
 */
function createResponsesStreamHandle(
  res: Response,
  controller: AbortController,
): StreamHandle {
  if (!res.body) {
    throw new Error('Response body is null')
  }

  let assistantText = ''
  const toolCalls: ToolCall[] = []
  let finishReason = ''
  let usage: TokenUsage | undefined

  const eventQueue: (CodexStreamEvent | null)[] = []
  let resolveWaiting: (() => void) | null = null

  function pushEvent(ev: CodexStreamEvent | null) {
    eventQueue.push(ev)
    if (resolveWaiting) {
      resolveWaiting()
      resolveWaiting = null
    }
  }

  async function waitForEvent(): Promise<CodexStreamEvent | null> {
    if (eventQueue.length > 0) {
      return eventQueue.shift()!
    }
    return new Promise<CodexStreamEvent | null>(resolve => {
      resolveWaiting = () => resolve(eventQueue.shift()!)
    })
  }

  let resolveResult: (r: CodexCompletedResult) => void
  let rejectResult: (e: Error) => void
  const resultPromise = new Promise<CodexCompletedResult>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })

  const processPromise = (async () => {
    try {
      for await (const sse of parseSseStream(res.body!, controller.signal)) {
        let event: any
        try {
          event = JSON.parse(sse.data)
        } catch {
          continue
        }

        const kind = event.type as string
        if (!kind) continue

        switch (kind) {
          // Text delta — incremental text from the model
          case 'response.output_text.delta': {
            const delta = event.delta as string
            if (delta) {
              assistantText += delta
              pushEvent({ type: 'text_delta', text: delta })
            }
            break
          }

          // Complete output item — function calls arrive here
          case 'response.output_item.done': {
            const item = event.item
            if (!item) break

            if (item.type === 'function_call') {
              const tc: ToolCall = {
                id: item.call_id || item.id || '',
                type: 'function',
                function: {
                  name: item.name || '',
                  arguments: item.arguments || '',
                },
              }
              toolCalls.push(tc)
              pushEvent({ type: 'tool_call_done', toolCall: tc })
            } else if (item.type === 'message') {
              // Extract text from content items
              const content = item.content as any[]
              if (content) {
                for (const c of content) {
                  if (c.type === 'output_text' && c.text) {
                    assistantText += c.text
                  }
                }
              }
            }
            break
          }

          // Stream complete — extract usage
          case 'response.completed': {
            const resp = event.response
            if (resp?.usage) {
              usage = {
                inputTokens: resp.usage.input_tokens || 0,
                outputTokens: resp.usage.output_tokens || 0,
                totalTokens: resp.usage.total_tokens || 0,
              }
            }
            finishReason = resp?.status || 'completed'
            break
          }

          case 'response.failed': {
            const resp = event.response
            const errorMsg = resp?.error?.message || 'Response failed'
            pushEvent({ type: 'error', message: errorMsg })
            break
          }

          // Ignore other events
          default:
            break
        }
      }

      // Stream ended — finalize
      pushEvent({
        type: 'message_done',
        content: assistantText,
        toolCalls,
        finishReason,
      })
      pushEvent(null)

      resolveResult!({
        content: assistantText,
        toolCalls,
        usage,
        finishReason,
      })
    } catch (err: any) {
      pushEvent({ type: 'error', message: err.message })
      pushEvent(null)
      rejectResult!(err)
    }
  })()

  processPromise.catch(() => {})

  const events: AsyncIterable<CodexStreamEvent> = {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<CodexStreamEvent>> {
          const ev = await waitForEvent()
          if (ev === null) return { done: true, value: undefined }
          return { done: false, value: ev }
        },
      }
    },
  }

  return {
    events,
    result: resultPromise,
    abort() { controller.abort() },
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Exponential backoff (port of Codex util.rs backoff) */
function backoff(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt - 1), 30_000)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
