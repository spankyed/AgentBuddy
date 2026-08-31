/**
 * Tool definition helpers for the model-client service.
 *
 * Thin wrappers around the Vercel AI SDK's tool() function and
 * OpenAI-specific built-in tools.
 */

import { tool } from 'ai'
import { openai } from '@ai-sdk/openai'
import type { z } from 'zod'

/**
 * Define a tool for the model to call.
 *
 * Thin wrapper around the AI SDK's `tool()` for ergonomic definitions.
 */
export function defineTool<T extends z.ZodType>(opts: {
  description: string
  parameters: T
  execute: (args: z.infer<T>) => Promise<string>
}) {
  return tool({
    description: opts.description,
    parameters: opts.parameters,
    execute: opts.execute,
  })
}

/**
 * Pre-configured OpenAI web search tool.
 *
 * Uses the Responses API's built-in `web_search_preview` tool.
 */
export function webSearchTool(opts?: {
  searchContextSize?: 'low' | 'medium' | 'high'
  userLocation?: { type: 'approximate'; city?: string; state?: string; country?: string }
}) {
  return openai.tools.webSearchPreview(opts)
}
