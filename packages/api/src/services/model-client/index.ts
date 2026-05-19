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
import type { JSONValue, LanguageModelV1ProviderMetadata } from '@ai-sdk/provider'
import { createOpenAI } from '@ai-sdk/openai'
import { getCredentials } from '../auth'
import { Conversation } from './conversation'
import { adaptStream } from './streaming'
import { defineTool, webSearchTool } from './tools'
import { compact } from './compact'
import { shellTool, readFileTool, writeFileTool, grepTool, listDirTool, patchTool, planTool, goalTool, userInputTool, viewImageTool } from './agent-tools'
import { createChatApprover } from './approval'
import { codingAgentTools } from './tool-presets'
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
export { shellTool, readFileTool, writeFileTool, grepTool, listDirTool, patchTool, planTool, goalTool, userInputTool, viewImageTool } from './agent-tools'
export { createChatApprover } from './approval'
export { codingAgentTools } from './tool-presets'
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
  ApproveFn,
  ToolOptions,
  RequestInputFn,
  UserInputQuestion,
  PlanStep,
  GoalState,
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

/** Build merged providerOptions for stateless streamTurn/generateTurn. */
function buildStatelessProviderOptions(params: TurnParams): LanguageModelV1ProviderMetadata | undefined {
  const openai: Record<string, JSONValue> = {}
  if (params.instructions) openai.instructions = params.instructions
  if (params.reasoning) {
    openai.reasoningEffort = params.reasoning.effort
    if (params.reasoning.summary) openai.reasoningSummary = params.reasoning.summary
  }
  return Object.keys(openai).length > 0 ? { openai } : undefined
}

/** One-shot streaming turn (no conversation state). */
async function* streamTurn(
  params: TurnParams & ModelClientConfig,
): AsyncGenerator<StreamEvent> {
  const model = await getModel(params)
  const { prompt, messages } = normalizeInput(params.input)
  const tools = params.tools ?? {} as ToolSet

  const providerOptions = buildStatelessProviderOptions(params)

  const result = aiStreamText({
    model,
    ...(prompt && { prompt }),
    ...(messages && { messages }),
    ...(Object.keys(tools).length > 0 && { tools }),
    maxSteps: params.maxSteps ?? 1,
    ...(params.signal && { abortSignal: params.signal }),
    ...(providerOptions && { providerOptions }),
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
  const providerOptions = buildStatelessProviderOptions(params)

  const result = await aiGenerateText({
    model,
    ...(prompt && { prompt }),
    ...(messages && { messages }),
    ...(Object.keys(tools).length > 0 && { tools }),
    maxSteps: params.maxSteps ?? 1,
    ...(params.signal && { abortSignal: params.signal }),
    ...(providerOptions && { providerOptions }),
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

  // ─── Agent tools ─────────────────────────────────────────────────────────

  /** Shell command execution tool. */
  shellTool,
  /** File read tool. */
  readFileTool,
  /** File write tool (supports approval). */
  writeFileTool,
  /** Grep/search tool. */
  grepTool,
  /** Directory listing tool. */
  listDirTool,
  /** Unified diff patch tool (supports approval). */
  patchTool,
  /** Plan/checklist management tool. */
  planTool,
  /** Goal tracking tool (create/get/update). */
  goalTool,
  /** Request user input mid-turn. */
  userInputTool,
  /** Load and return image files as data URLs. */
  viewImageTool,
  /** Pre-assembled tool set for coding agents. */
  codingAgentTools,
  /** Create an approval callback wired to the chat UI. */
  createChatApprover,
}
