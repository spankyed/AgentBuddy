import { emit } from '@/core/utils/actor-helpers'
import { rootEvents } from '@/core/router/bus-emitter'
import { GitRepository } from '../services/git'

const pluginId = 'code' as const

/**
 * Helper function to check if git repository is available in context
 * Sends error event if not available
 */
export function requireGitRepository<T extends { gitRepository: GitRepository | null }>(
  context: T
): context is T & { gitRepository: GitRepository } {
  if (!context.gitRepository) {
    const wrapped = emit(pluginId, {
      type: 'commit.ERROR_RECEIVED',
      data: { message: 'No directory selected. Please select a directory first.' }
    })
    rootEvents.emitOutgoing(wrapped.event)
    return false
  }
  return true
}