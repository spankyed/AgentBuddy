import type { CodexTurnHandle } from './types'
import { createLogger } from '@abuddy/sdk/logger'
import { registerThreadTeardown } from '@abuddy/sdk/services'

const logger = createLogger('codex-handle-store')
const activeHandles = new Map<string, CodexTurnHandle>()

registerThreadTeardown((threadId: string) => {
  const h = activeHandles.get(threadId)
  if (h) {
    try { h.abort()?.catch?.(() => {}) } catch { /* already gone */ }
    activeHandles.delete(threadId)
  }
})

export function storeHandle(key: string, handle: CodexTurnHandle): void {
  const existing = activeHandles.get(key)
  if (existing?.codexThreadId === handle.codexThreadId && existing.turnId === handle.turnId) {
    activeHandles.set(key, handle)
    return
  }
  if (existing) {
    try { existing.abort()?.catch?.(() => {}) } catch { /* already gone */ }
    logger.warn('overwriting active handle — aborted previous', { key })
  }
  activeHandles.set(key, handle)
}

export function getHandle(key: string): CodexTurnHandle | undefined {
  return activeHandles.get(key)
}

export function clearHandle(key: string): void {
  activeHandles.delete(key)
}
