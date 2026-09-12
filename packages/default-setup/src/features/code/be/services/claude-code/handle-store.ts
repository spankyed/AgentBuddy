import type { QueryHandle } from './query'
import { createLogger } from '@abuddy/sdk/logger'
import { registerThreadTeardown } from '@abuddy/sdk/services'

const logger = createLogger('claude-code-handle-store')
const activeHandles = new Map<string, QueryHandle>()

registerThreadTeardown((threadId: string) => {
  const h = activeHandles.get(threadId)
  if (h) {
    try { h.kill() } catch { /* already gone */ }
    activeHandles.delete(threadId)
  }
})

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
