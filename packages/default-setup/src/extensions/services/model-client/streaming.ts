/**
 * Streaming adapter — wraps the Vercel AI SDK's fullStream into typed StreamEvents.
 *
 * The AI SDK's `fullStream` is an AsyncIterableStream of `TextStreamPart` objects.
 * This adapter re-maps them into our `StreamEvent` vocabulary.
 */

import type { StreamTextResult, ToolSet, LanguageModelUsage, FinishReason } from 'ai'
import type { StreamEvent } from './types'

/**
 * Adapt a streamText result into an async iterable of StreamEvents.
 * Consumes the SDK's `fullStream` and emits typed events.
 */
export async function* adaptStream(
  result: StreamTextResult<ToolSet, unknown>,
): AsyncGenerator<StreamEvent> {
  for await (const part of result.fullStream) {
    // Cast to a generic record to handle all part types uniformly,
    // including tool-result which is conditional on tools having execute.
    const p = part as Record<string, unknown> & { type: string }

    switch (p.type) {
      case 'text-delta':
        yield { type: 'text-delta', textDelta: p.textDelta as string }
        break

      case 'reasoning':
        yield { type: 'reasoning', textDelta: p.textDelta as string }
        break

      case 'tool-call-streaming-start':
        yield { type: 'tool-call-start', toolCallId: p.toolCallId as string, toolName: p.toolName as string }
        break

      case 'tool-call-delta':
        yield { type: 'tool-call-delta', toolCallId: p.toolCallId as string, toolName: p.toolName as string, argsTextDelta: p.argsTextDelta as string }
        break

      case 'tool-call':
        yield { type: 'tool-call', toolCallId: p.toolCallId as string, toolName: p.toolName as string, args: p.args }
        break

      case 'tool-result':
        yield { type: 'tool-result', toolCallId: p.toolCallId as string, toolName: p.toolName as string, result: p.result }
        break

      case 'step-finish':
        yield { type: 'step-complete', usage: p.usage as LanguageModelUsage, finishReason: p.finishReason as FinishReason, isContinued: p.isContinued as boolean }
        break

      case 'finish': {
        const meta = p.providerMetadata as Record<string, unknown> | undefined
        const openaiMeta = meta?.openai as Record<string, unknown> | undefined
        yield { type: 'turn-complete', usage: p.usage as LanguageModelUsage, finishReason: p.finishReason as FinishReason, responseId: openaiMeta?.responseId as string | undefined }
        break
      }

      case 'error':
        yield { type: 'error', error: p.error }
        break

      default:
        break
    }
  }
}
