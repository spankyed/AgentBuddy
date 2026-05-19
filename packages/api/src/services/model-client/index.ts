/**
 * Model client service — low-level building blocks for agentic AI.
 *
 * Wraps the OpenAI Responses API via the Vercel AI SDK, providing:
 *   - Conversation threading (previous_response_id chains)
 *   - Streaming with typed events
 *   - Agentic tool execution loops (maxSteps)
 *   - Reasoning model support
 *   - Web search as a tool
 *   - Conversation compaction
 *
 * Named after Codex's `ModelClient` — the orchestrator that manages
 * conversations, tools, and streaming over the Responses API.
 */

import { streamText as aiStreamText, generateText as aiGenerateText } from 'ai'
import type { CoreMessage, ToolSet } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { getCredentials } from '../api-keys'
import { Conversation } from './conversation'
import { adaptStream } from './streaming'
import { defineTool, webSearchTool } from './tools'
import { compact } from './compact'
import type {
  ConversationConfig,
  ModelClientConfig,
  TurnParams,
  TurnResult,
  StreamEvent,
  CompactParams,
  CompactResult,
} from './types'

// ─── Re-exports ──────────────────────────────────────────────────────────────

export { Conversation } from './conversation'
export { adaptStream } from './streaming'
export { defineTool, webSearchTool } from './tools'
export { compact } from './compact'
export type {
  ModelClientConfig,
  ConversationConfig,
  ConversationState,
  ReasoningConfig,
  TurnParams,
  TurnResult,
  StreamEvent,
  CompactParams,
  CompactResult,
} from './types'

// ─── Stateless helpers ───────────────────────────────────────────────────────

async function getModel(config: ModelClientConfig) {
  const creds = await getCredentials(config.provider, config.apiKey)
  const provider = createOpenAI({
    apiKey: creds.token,
    ...(creds.headers && { headers: creds.headers }),
    ...(config.baseURL && { baseURL: config.baseURL }),
  })
  return provider.responses(config.model)
}

function normalizeInput(input: string | CoreMessage[]): { prompt?: string; messages?: CoreMessage[] } {
  if (typeof input === 'string') return { prompt: input }
  return { messages: input }
}

/** One-shot streaming turn (no conversation state). */
async function* streamTurn(
  params: TurnParams & ModelClientConfig,
): AsyncGenerator<StreamEvent> {
  const model = await getModel(params)
  const { prompt, messages } = normalizeInput(params.input)
  const tools = params.tools ?? {} as ToolSet

  const result = aiStreamText({
    model,
    ...(prompt && { prompt }),
    ...(messages && { messages }),
    ...(Object.keys(tools).length > 0 && { tools }),
    maxSteps: params.maxSteps ?? 1,
    ...(params.signal && { abortSignal: params.signal }),
    ...(params.instructions && {
      providerOptions: { openai: { instructions: params.instructions } },
    }),
    ...(params.reasoning && {
      providerOptions: {
        openai: {
          reasoningEffort: params.reasoning.effort,
          ...(params.reasoning.summary && { reasoningSummary: params.reasoning.summary }),
        },
      },
    }),
  })

  yield* adaptStream(result)
}

/** One-shot non-streaming turn (no conversation state). */
async function generateTurn(
  params: TurnParams & ModelClientConfig,
): Promise<TurnResult> {
  const model = await getModel(params)
  const { prompt, messages } = normalizeInput(params.input)
  const tools = params.tools ?? {} as ToolSet

  const result = await aiGenerateText({
    model,
    ...(prompt && { prompt }),
    ...(messages && { messages }),
    ...(Object.keys(tools).length > 0 && { tools }),
    maxSteps: params.maxSteps ?? 1,
    ...(params.signal && { abortSignal: params.signal }),
    ...(params.instructions && {
      providerOptions: { openai: { instructions: params.instructions } },
    }),
    ...(params.reasoning && {
      providerOptions: {
        openai: {
          reasoningEffort: params.reasoning.effort,
          ...(params.reasoning.summary && { reasoningSummary: params.reasoning.summary }),
        },
      },
    }),
  })

  const openaiMeta = result.providerMetadata?.openai as Record<string, unknown> | undefined
  return {
    responseId: openaiMeta?.responseId as string | undefined,
    text: result.text,
    reasoning: result.reasoning,
    toolCalls: result.toolCalls,
    toolResults: result.toolResults,
    usage: result.usage,
    steps: result.steps.length,
    finishReason: result.finishReason,
  }
}

// ─── Service object ──────────────────────────────────────────────────────────

export const modelClientService = {
  /** Create a stateful conversation with previous_response_id threading. */
  createConversation(config: ConversationConfig): Conversation {
    return new Conversation(config)
  },

  /** One-shot streaming turn (no conversation state). */
  streamTurn,

  /** One-shot non-streaming turn (no conversation state). */
  generateTurn,

  /** Define a tool for the model to call. */
  defineTool,

  /** Pre-configured OpenAI web search tool. */
  webSearchTool,

  /** Compact a conversation via the Responses API. */
  compact(params: CompactParams, config: ModelClientConfig): Promise<CompactResult> {
    return compact(params, config)
  },
}
