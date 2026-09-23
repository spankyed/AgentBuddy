
import { broadcastToPlugin } from '@/__generated__/events';
import { GitRepository } from '../services/git'

const pluginId = 'code' as const

type ErrorEventType = 'commit.ERROR_RECEIVED' | 'pr.ERROR'

export function requireGitRepository<T extends { gitRepository: GitRepository | null }>(
  context: T,
  errorEventType: ErrorEventType = 'commit.ERROR_RECEIVED'
): context is T & { gitRepository: GitRepository } {
  if (!context.gitRepository) {
    const message = 'No directory selected. Please select a directory first.'
    
    if (errorEventType === 'pr.ERROR') {
      broadcastToPlugin(pluginId, { type: 'pr.ERROR', message })
    } else {
      broadcastToPlugin(pluginId, { type: 'commit.ERROR_RECEIVED', data: { message } })
    }
    return false
  }
  return true
}