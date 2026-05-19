/**
 * Conversation manager — tracks previous_response_id chains for the
 * OpenAI Responses API's built-in conversation threading.
 *
 * Each Conversation instance is stateful: it tracks the previousResponseId
 * and cumulative usage across turns. State is purely in-memory.
 */

import { streamText as aiStreamText, generateText as aiGenerateText } from 'ai'
import type { CoreMessage, LanguageModelUsage, ToolSet } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { getCredentials } from '../auth'
import { adaptStream } from './streaming'
import { compact as compactApi } from './compact'
import type {
  ConversationConfig,
  ConversationState,
  TurnParams,
  TurnResult,
  StreamEvent,
  CompactResult,
  ReasoningConfig,
} from './types'

function emptyUsage(): LanguageModelUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
}

function addUsage(a: LanguageModelUsage, b: LanguageModelUsage): LanguageModelUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  }
}

function buildProviderOptions(
  previousResponseId: string | null,
  config: ConversationConfig,
  turnParams?: TurnParams,
) {
  const reasoning = turnParams?.reasoning ?? config.reasoning
  return {
    openai: {
      ...(previousResponseId && { previousResponseId }),
      ...(config.store !== undefined && { store: config.store }),
      ...(config.metadata && { metadata: config.metadata }),
      ...(config.instructions && { instructions: config.instructions }),
      ...(turnParams?.instructions && { instructions: turnParams.instructions }),
      ...(reasoning && buildReasoningOptions(reasoning)),
    },
  }
}

function buildReasoningOptions(reasoning: ReasoningConfig) {
  return {
    reasoningEffort: reasoning.effort,
    ...(reasoning.summary && { reasoningSummary: reasoning.summary }),
  }
}

async function getModel(config: ConversationConfig) {
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

export class Conversation {
  private _config: ConversationConfig
  private _previousResponseId: string | null = null
  private _turnCount = 0
  private _cumulativeUsage: LanguageModelUsage = emptyUsage()

  constructor(config: ConversationConfig) {
    this._config = config
  }

  get state(): ConversationState {
    return {
      previousResponseId: this._previousResponseId,
      turnCount: this._turnCount,
      cumulativeUsage: { ...this._cumulativeUsage },
    }
  }

  get previousResponseId(): string | null {
    return this._previousResponseId
  }

  /** Execute a turn with streaming events. */
  async *streamTurn(params: TurnParams): AsyncGenerator<StreamEvent> {
    const model = await getModel(this._config)
    const { prompt, messages } = normalizeInput(params.input)
    const tools = { ...this._config.tools, ...params.tools } as ToolSet

    const result = aiStreamText({
      model,
      ...(prompt && { prompt }),
      ...(messages && { messages }),
      ...(Object.keys(tools).length > 0 && { tools }),
      maxSteps: params.maxSteps ?? this._config.maxSteps ?? 1,
      ...(params.signal && { abortSignal: params.signal }),
      providerOptions: buildProviderOptions(this._previousResponseId, this._config, params),
    })

    let lastResponseId: string | undefined
    let turnUsage: LanguageModelUsage = emptyUsage()
    let completed = false

    for await (const event of adaptStream(result)) {
      if (event.type === 'turn-complete') {
        lastResponseId = event.responseId ?? lastResponseId
        turnUsage = event.usage
        completed = true
      }
      yield event
    }

    // Only update conversation state on successful completion
    if (completed) {
      if (lastResponseId) {
        this._previousResponseId = lastResponseId
      }
      this._turnCount++
      this._cumulativeUsage = addUsage(this._cumulativeUsage, turnUsage)
    }
  }

  /** Execute a turn and return the complete result (non-streaming). */
  async generateTurn(params: TurnParams): Promise<TurnResult> {
    const model = await getModel(this._config)
    const { prompt, messages } = normalizeInput(params.input)
    const tools = { ...this._config.tools, ...params.tools } as ToolSet

    const result = await aiGenerateText({
      model,
      ...(prompt && { prompt }),
      ...(messages && { messages }),
      ...(Object.keys(tools).length > 0 && { tools }),
      maxSteps: params.maxSteps ?? this._config.maxSteps ?? 1,
      ...(params.signal && { abortSignal: params.signal }),
      providerOptions: buildProviderOptions(this._previousResponseId, this._config, params),
    })

    // Extract responseId from provider metadata
    const openaiMeta = result.providerMetadata?.openai as Record<string, unknown> | undefined
    const responseId = openaiMeta?.responseId as string | undefined

    if (responseId) {
      this._previousResponseId = responseId
    }
    this._turnCount++
    this._cumulativeUsage = addUsage(this._cumulativeUsage, result.usage)

    return {
      responseId,
      text: result.text,
      reasoning: result.reasoning,
      toolCalls: result.toolCalls,
      toolResults: result.toolResults,
      usage: result.usage,
      steps: result.steps.length,
      finishReason: result.finishReason,
    }
  }

  /** Compact the conversation history via the Responses API. */
  async compact(): Promise<CompactResult> {
    if (!this._previousResponseId) {
      throw new Error('Cannot compact: no previous response ID (conversation has no turns)')
    }
    const result = await compactApi(
      { previousResponseId: this._previousResponseId },
      this._config,
    )
    this._previousResponseId = result.newResponseId
    return result
  }

  /** Reset conversation state (clear previousResponseId chain). */
  reset(): void {
    this._previousResponseId = null
    this._turnCount = 0
    this._cumulativeUsage = emptyUsage()
  }
}
