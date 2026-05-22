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
 *
 * Each stored handle automatically registers a thread cleanup callback so
 * the threads system can kill the process before soft-deleting messages
 * (e.g. on revert/summarize). The callback is unregistered on `clearHandle`.
 */

import type { QueryHandle } from './query'
import { createLogger } from '@/core/shared/debug/logger'
import { registerCleanup } from '../threads'

const logger = createLogger('claude-code-handle-store')
const activeHandles = new Map<string, QueryHandle>()
const cleanupUnsubs = new Map<string, () => void>()

export function storeHandle(key: string, handle: QueryHandle): void {
  const existing = activeHandles.get(key)
  if (existing) {
    try { existing.kill() } catch { /* already gone */ }
    logger.warn('overwriting active handle — killed previous', { key })
  }
  // Unregister previous cleanup before registering new one
  cleanupUnsubs.get(key)?.()

  activeHandles.set(key, handle)

  const unsub = registerCleanup(`cli-handle:${key}`, (threadId: string) => {
    if (threadId !== key) return
    const h = activeHandles.get(key)
    if (h) {
      try { h.kill() } catch { /* already gone */ }
      activeHandles.delete(key)
    }
  })
  cleanupUnsubs.set(key, unsub)
}

export function getHandle(key: string): QueryHandle | undefined {
  return activeHandles.get(key)
}

export function clearHandle(key: string): void {
  activeHandles.delete(key)
  cleanupUnsubs.get(key)?.()
  cleanupUnsubs.delete(key)
}
