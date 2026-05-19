/**
 * Conversation compaction — direct HTTP call to POST /v1/responses/compact.
 *
 * This endpoint is not exposed by the Vercel AI SDK, so we call it directly.
 * Compaction summarizes the conversation history into a shorter form while
 * preserving a valid previousResponseId chain.
 */

import { getCredentials } from '../auth'
import type { CompactParams, CompactResult, ModelClientConfig } from './types'

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

/**
 * Compact a conversation by summarizing prior turns.
 *
 * Calls `POST /v1/responses/compact` with the given previousResponseId.
 * Returns a new response ID pointing to the compacted history.
 */
export async function compact(
  params: CompactParams,
  config: ModelClientConfig,
): Promise<CompactResult> {
  const creds = await getCredentials(config.provider, config.apiKey)
  const baseUrl = config.baseURL || DEFAULT_BASE_URL

  const response = await fetch(`${baseUrl}/responses/compact`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${creds.token}`,
      ...(creds.headers ?? {}),
    },
    body: JSON.stringify({
      model: params.model || config.model,
      previous_response_id: params.previousResponseId,
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Compact API failed (${response.status}): ${text.slice(0, 500)}`)
  }

  const data = await response.json() as Record<string, unknown>
  return {
    newResponseId: (data.id ?? data.response_id ?? '') as string,
    summary: data.summary as string | undefined,
  }
}
