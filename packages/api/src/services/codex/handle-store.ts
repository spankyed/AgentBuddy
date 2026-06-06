/** Per-thread handle store for active Codex turns. Callers must call clearHandle on completion. */

import type { CodexTurnHandle } from './types'
import { createLogger } from '@/core/shared/debug/logger'
import { registerCleanup } from '../threads'

const logger = createLogger('codex-handle-store')
const activeHandles = new Map<string, CodexTurnHandle>()
const cleanupUnsubs = new Map<string, () => void>()

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
  cleanupUnsubs.get(key)?.()
  activeHandles.set(key, handle)

  const unsub = registerCleanup(`codex-handle:${key}`, (threadId: string) => {
    if (threadId !== key) return
    const h = activeHandles.get(key)
    if (h) {
      try { h.abort()?.catch?.(() => {}) } catch { /* already gone */ }
      activeHandles.delete(key)
    }
  })
  cleanupUnsubs.set(key, unsub)
}

export function getHandle(key: string): CodexTurnHandle | undefined {
  return activeHandles.get(key)
}

export function clearHandle(key: string): void {
  activeHandles.delete(key)
  cleanupUnsubs.get(key)?.()
  cleanupUnsubs.delete(key)
}
