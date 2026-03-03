/**
 * Directory State Management:
 *
 * State:
 * - baseDirectory: Root workspace directory (project root)
 * - activeDirectory: Currently browsed subdirectory in explorer
 * - Both are duplicated across parent and children for independence
 * - Parent broadcasts directory changes to all children
 *
 * Persistence (saved to settings):
 * - defaultBaseDirectory: User's explicit preferred default (set via settings UI)
 * - lastDirectoryOpened: Last directory user navigated to (tracked automatically)
 *
 * Priority on startup:
 *   defaultBaseDirectory > lastDirectoryOpened > first workspace project > null
 */
import { setup, enqueueActions, assign } from 'xstate'
import { systemBus, fromSystem } from '@/core/utils/event-helpers'
import { z } from 'zod'
import { safeEvents, emit } from '@/core/utils/actor-helpers'
import { rootEvents } from '@/core/router/bus-emitter'
import { SystemEvents } from '@/systems/backend'
import type { MergeReceivable } from '@/core/utils/event-helpers'
import { GitRepository } from './services/git'
import { GitWatcherService } from './services/gitwatcher'
import { repository } from '@/repository'

// child systems
import { explorerSystem, IncomingExplorerEvents, OutgoingExplorerEvents } from './features/explorer'
import { searchSystem, IncomingSearchEvents, OutgoingSearchEvents } from './features/search'
import { commitSystem, IncomingCommitEvents, OutgoingCommitEvents } from './features/commit'
import { pullRequestSystem, IncomingPullRequestEvents, OutgoingPullRequestEvents } from './features/pull-request'
import { terminalSystem, IncomingTerminalEvents, OutgoingTerminalEvents } from './features/terminal'
import { actionsSystem, IncomingActionsEvents, OutgoingActionsEvents } from './features/actions'
import { promptsSystem, IncomingPromptsEvents, OutgoingPromptsEvents } from './features/prompts'

export const id = 'code' as const

const busEvent = systemBus(id)

// Union all incoming events from child systems
const IncomingCodeEvents = [
  ...IncomingExplorerEvents,
  ...IncomingSearchEvents,
  ...IncomingCommitEvents,
  ...IncomingPullRequestEvents,
  ...IncomingTerminalEvents,
  ...IncomingActionsEvents,
  ...IncomingPromptsEvents,
  // Special root-level events
  busEvent('SET_BASE_DIRECTORY', { path: z.string(), fromUserNavigation: z.boolean().optional() }),
] as const

// Union all outgoing events from child systems  
export type OutgoingCodeEvents =
  | OutgoingExplorerEvents
  | OutgoingSearchEvents
  | OutgoingCommitEvents
  | OutgoingPullRequestEvents
  | OutgoingTerminalEvents
  | OutgoingActionsEvents
  // Broadcast events (sent to all child systems)
  | { type: 'CODE_CONNECTED'; data: CodeConnectedData }
  | { type: 'CODE_SETTINGS_UPDATED'; settings: CodeSettings }

// Import only the type needed for broadcast event
import { TerminalInfo, CodeConnectedData, CodeSettings } from './types'

export const incomingSystemEvents = fromSystem(IncomingCodeEvents)<OutgoingCodeEvents, typeof id>()

type CodeInternalEvents = SystemEvents | { type: 'CODE_SETTINGS_UPDATED'; settings: CodeSettings }
type ReceivableEvents = MergeReceivable<typeof IncomingCodeEvents, CodeInternalEvents>

export interface Context {
  baseDirectory: string | null
  gitRepository: GitRepository | null
  gitWatcher: GitWatcherService | null
}

const typeOf = safeEvents<ReceivableEvents>()

/**
 * Resolves the initial base directory on system startup.
 * Priority chain: defaultBaseDirectory > lastDirectoryOpened > first workspace project > null
 */
function resolveInitialDirectory(
  codeSettings: CodeSettings | undefined,
  projects: any[]
): string | null {
  // User's explicit default takes priority
  if (codeSettings?.defaultBaseDirectory) {
    return codeSettings.defaultBaseDirectory
  }

  // Fall back to last directory they were in
  if (codeSettings?.lastDirectoryOpened) {
    return codeSettings.lastDirectoryOpened
  }

  // Fall back to first project directory
  const firstProjectDir = projects[0]?.directories?.[0]
  if (firstProjectDir) {
    return firstProjectDir
  }

  // No directory available
  return null
}

export const systemMachine = setup({
  types: {
    context: {} as Context,
    events: {} as ReceivableEvents,
  },
  actors: {
    explorerSystem,
    searchSystem,
    commitSystem,
    pullRequestSystem,
    terminalSystem,
    actionsSystem,
    promptsSystem
  },
  actions: {
    spawnFeatureActors: enqueueActions(({ enqueue, context }) => {
      // Spawn all child systems with input and shared services
      enqueue.spawnChild('explorerSystem', {
        systemId: 'explorer',
        input: {
          baseDirectory: context.baseDirectory,
          gitWatcher: context.gitWatcher
        }
      });
      enqueue.spawnChild('searchSystem', {
        systemId: 'search',
        input: {
          baseDirectory: context.baseDirectory
        }
      });
      enqueue.spawnChild('commitSystem', {
        systemId: 'commit',
        input: {
          baseDirectory: context.baseDirectory,
          gitRepository: context.gitRepository,
          gitWatcher: context.gitWatcher
        }
      });
      enqueue.spawnChild('pullRequestSystem', {
        systemId: 'pr',
        input: {
          baseDirectory: context.baseDirectory,
          gitRepository: context.gitRepository
        }
      });
      enqueue.spawnChild('terminalSystem', {
        systemId: 'terminal',
        input: {
          baseDirectory: context.baseDirectory
        }
      });
      enqueue.spawnChild('actionsSystem', { systemId: 'codeActions' });
      enqueue.spawnChild('promptsSystem', { systemId: 'codePrompts' });
    }),


    routeEvent: ({ event, system }) => {
      const eventType = event.type;
      
      // Route based on prefix - prefix matches system ID
      const [prefix] = eventType.split('.');
      if (prefix) {
        system.get(prefix)?.send(event);
      }
    },

    updateBaseDirectory: assign({
      baseDirectory: ({ event }) => {
        const ev = typeOf('SET_BASE_DIRECTORY', event)
        // Save to navigation history only when triggered by user navigation
        // (not when applying settings like defaultBaseDirectory)
        if (ev.fromUserNavigation !== false) {
          repository.settingsCommands.updateSettings('plugin', 'code', ['lastDirectoryOpened'], ev.path)
        }
        return ev.path
      },
      gitRepository: ({ event, context }) => {
        const ev = typeOf('SET_BASE_DIRECTORY', event)
        // Clear the old repository's cache before creating new one
        if (context.gitRepository) {
          context.gitRepository.clearCache()
        }
        return new GitRepository(ev.path)
      },
      gitWatcher: ({ event, context }) => {
        const ev = typeOf('SET_BASE_DIRECTORY', event)
        // Stop the old watcher before creating new one
        if (context.gitWatcher) {
          context.gitWatcher.stopWatching()
        }
        return new GitWatcherService(ev.path)
      }
    }),

    notifyChildSystemsOfBaseChange: ({ event, system, context }) => {
      const ev = typeOf('SET_BASE_DIRECTORY', event)
      const newPath = ev.path

      // Update child systems
      system.get('explorer')?.send({
        type: 'explorer.UPDATE_BASE_DIRECTORY',
        path: newPath,
        gitWatcher: context.gitWatcher
      });
      system.get('search')?.send({ type: 'search.UPDATE_BASE_DIRECTORY', path: newPath });
      // Pass the new git services to systems that need them
      system.get('commit')?.send({
        type: 'commit.UPDATE_BASE_DIRECTORY',
        path: newPath,
        gitRepository: context.gitRepository,
        gitWatcher: context.gitWatcher
      });
      system.get('pr')?.send({
        type: 'pr.UPDATE_BASE_DIRECTORY',
        path: newPath,
        gitRepository: context.gitRepository
      });
      // Note: Updates terminal's base directory for new terminal creation.
      // Individual terminal processes track their own cwd independently.
      system.get('terminal')?.send({ type: 'terminal.UPDATE_BASE_DIRECTORY', path: newPath });
    },

    updateSettings: ({ event, context, self }) => {
      const ev = event as { type: 'CODE_SETTINGS_UPDATED'; settings: CodeSettings }

      // Check if defaultBaseDirectory changed and apply it immediately for instant feedback
      if (ev.settings.defaultBaseDirectory &&
          ev.settings.defaultBaseDirectory !== context.baseDirectory) {
        // Apply the new default base directory
        // Mark as non-navigation so it doesn't overwrite lastDirectoryOpened
        self.send({
          type: 'SET_BASE_DIRECTORY',
          path: ev.settings.defaultBaseDirectory,
          fromUserNavigation: false
        })
      }

      // Forward settings to frontend
      const wrapped = emit(id, {
        type: 'CODE_SETTINGS_UPDATED',
        settings: ev.settings
      })
      rootEvents.emitOutgoing(wrapped.event)
    },
    
    broadcastConnected: ({ system, context }) => {
      // Send CODE_CONNECTED to all children that need it
      system.get('explorer')?.send({ type: 'CODE_CONNECTED' });
      system.get('terminal')?.send({ type: 'CODE_CONNECTED' });
      system.get('codeActions')?.send({ type: 'CODE_CONNECTED' });
      system.get('codePrompts')?.send({ type: 'CODE_CONNECTED' });

      // Get code settings - this will create default settings if they don't exist
      const codeSettings = repository.settingsQueries.getPluginSettings('code') as CodeSettings;

      // Send initial directory state to frontend
      const connectedData: CodeConnectedData = {
        baseDirectory: context.baseDirectory,
        settings: codeSettings
      };

      const wrapped = emit(id, {
        type: 'CODE_CONNECTED',
        data: connectedData
      })
      rootEvents.emitOutgoing(wrapped.event)
    },
    
    setupGitWatcher: async ({ context, system }) => {
      if (!context.gitWatcher || !context.gitRepository) {
        // No directory selected yet
        return
      }
      
      // Set up the callback for git changes
      context.gitWatcher.setChangeCallback(() => {
        // Clear git cache when git status changes
        context.gitRepository?.clearCache()
        
        // Notify commit system of changes
        system.get('commit')?.send({ type: 'commit.GIT_STATUS_CHANGED' })
        
        // Also notify the PR system
        system.get('pr')?.send({ type: 'pr.GIT_STATUS_CHANGED' })
      })

      // Start watching git changes
      await context.gitWatcher.startWatching()
    },
    
    restartGitWatcher: async ({ context, system }) => {
      if (!context.gitWatcher || !context.gitRepository) {
        return
      }

      // Set up the callback for git changes (same as setupGitWatcher)
      context.gitWatcher.setChangeCallback(() => {
        // Clear git cache when git status changes
        context.gitRepository?.clearCache()

        // Notify commit system of changes
        system.get('commit')?.send({ type: 'commit.GIT_STATUS_CHANGED' })

        // Also notify the PR system
        system.get('pr')?.send({ type: 'pr.GIT_STATUS_CHANGED' })
      })

      // Start watching git changes
      await context.gitWatcher.startWatching()
    }
  }
}).createMachine({
  id,
  initial: 'idle',
  context: () => {
    const codeSettings = repository.settingsQueries.getPluginSettings('code') as CodeSettings
    const projects = (repository.settingsQueries.getGeneralSettings('projects') as any) || []

    // Resolve initial directory using priority chain
    const baseDir = resolveInitialDirectory(codeSettings, projects)

    return {
      baseDirectory: baseDir,
      gitRepository: baseDir ? new GitRepository(baseDir) : null,
      gitWatcher: baseDir ? new GitWatcherService(baseDir) : null
    }
  },
  entry: ['spawnFeatureActors', 'setupGitWatcher'],
  states: {
    idle: {
      on: {
        CLIENT_CONNECTED: {
          actions: 'broadcastConnected',
        },
        // Handle settings updates
        CODE_SETTINGS_UPDATED: {
          actions: 'updateSettings'
        },
        // Handle SET_BASE_DIRECTORY specially
        SET_BASE_DIRECTORY: {
          actions: ['updateBaseDirectory', 'notifyChildSystemsOfBaseChange', 'restartGitWatcher']
        },
        // All other events get routed to children
        '*': {
          actions: 'routeEvent'
        }
      }
    }
  }
})