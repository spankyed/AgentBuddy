
import { emit } from '@/__generated__/events';
import { rootEvents } from '@abuddy/sdk/rpc'
import { GitRepository } from '../services/git'

const pluginId = 'code' as const

type ErrorEventType = 'commit.ERROR_RECEIVED' | 'pr.ERROR'

export function requireGitRepository<T extends { gitRepository: GitRepository | null }>(
  context: T,
  errorEventType: ErrorEventType = 'commit.ERROR_RECEIVED'
): context is T & { gitRepository: GitRepository } {
  if (!context.gitRepository) {
    const message = 'No directory selected. Please select a directory first.'
    
    const wrapped = errorEventType === 'pr.ERROR'
      ? emit(pluginId, {
          type: 'pr.ERROR',
          message
        })
      : emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message }
        })
    
    rootEvents.emitOutgoing(wrapped.event)
    return false
  }
  return true
}