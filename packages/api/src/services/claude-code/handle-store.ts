/**
 * Module-level store for active CLI query handles, keyed by thread ID.
 *
 * The Claude Code chat action stores the handle when starting a query so
 * that other actions (e.g. "CC: Route Response") can write control_responses
 * back to the CLI's stdin via `handle.respond()`. The store survives across
 * compiled-action invocations within the same process (it's a plain Map in
 * the Node.js module cache, not per-scope state).
 *
 * Callers MUST call `clearHandle` when the query ends (success or error) to
 * avoid leaking references to dead child processes.
 */

import type { QueryHandle } from './query'
import { createLogger } from '@/core/helpers/debug/logger'

const logger = createLogger('claude-code-handle-store')
const activeHandles = new Map<string, QueryHandle>()

export function storeHandle(key: string, handle: QueryHandle): void {
  const existing = activeHandles.get(key)
  if (existing) {
    try { existing.kill() } catch { /* already gone */ }
    logger.warn('overwriting active handle — killed previous', { key })
  }
  activeHandles.set(key, handle)
}

export function getHandle(key: string): QueryHandle | undefined {
  return activeHandles.get(key)
}

export function clearHandle(key: string): void {
  activeHandles.delete(key)
}
