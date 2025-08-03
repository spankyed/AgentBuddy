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
  // Special root-level event
  busEvent('SET_ROOT_DIRECTORY', { path: z.string() }),
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
  | { type: 'CODE_STARTUP'; data: { terminals: TerminalInfo[]; rootDirectory: string | null; currentDirectory: string | null } }

// Import only the type needed for broadcast event
import { TerminalInfo } from './types'

export const incomingSystemEvents = fromSystem(IncomingCodeEvents)<OutgoingCodeEvents, typeof id>()

type CodeInternalEvents = SystemEvents
type ReceivableEvents = MergeReceivable<typeof IncomingCodeEvents, CodeInternalEvents>

export interface Context {
  currentDirectory: string | null
  rootDirectory: string | null
  gitRepository: GitRepository | null
  gitWatcher: GitWatcherService | null
}

const typeOf = safeEvents<ReceivableEvents>()

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
          rootDirectory: context.rootDirectory,
          currentDirectory: context.currentDirectory
        }
      });
      enqueue.spawnChild('searchSystem', { 
        systemId: 'search',
        input: {
          rootDirectory: context.rootDirectory
        }
      });
      enqueue.spawnChild('commitSystem', { 
        systemId: 'commit',
        input: {
          rootDirectory: context.rootDirectory,
          gitRepository: context.gitRepository,
          gitWatcher: context.gitWatcher
        }
      });
      enqueue.spawnChild('pullRequestSystem', { 
        systemId: 'pr',
        input: {
          rootDirectory: context.rootDirectory,
          gitRepository: context.gitRepository
        }
      });
      enqueue.spawnChild('terminalSystem', { 
        systemId: 'terminal',
        input: {
          rootDirectory: context.rootDirectory
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

    updateRootDirectory: assign({
      rootDirectory: ({ event }) => {
        const ev = typeOf('SET_ROOT_DIRECTORY', event)
        // Save to EARS as last opened directory
        repository.directoryCommands.markAsLastOpened(ev.path)
        return ev.path
      },
      currentDirectory: ({ event }) => {
        const ev = typeOf('SET_ROOT_DIRECTORY', event)
        return ev.path
      },
      gitRepository: ({ event, context }) => {
        const ev = typeOf('SET_ROOT_DIRECTORY', event)
        // Clear the old repository's cache before creating new one
        if (context.gitRepository) {
          context.gitRepository.clearCache()
        }
        return new GitRepository(ev.path)
      },
      gitWatcher: ({ event, context }) => {
        const ev = typeOf('SET_ROOT_DIRECTORY', event)
        // Stop the old watcher before creating new one
        if (context.gitWatcher) {
          context.gitWatcher.stopWatching()
        }
        return new GitWatcherService(ev.path)
      }
    }),

    notifyChildSystemsOfRootChange: ({ event, system, context }) => {
      const ev = typeOf('SET_ROOT_DIRECTORY', event)
      const newPath = ev.path
      
      // Update child systems
      system.get('explorer')?.send({ type: 'explorer.SET_ROOT_DIRECTORY', path: newPath });
      system.get('search')?.send({ type: 'search.UPDATE_ROOT_DIRECTORY', path: newPath });
      // Pass the new git services to systems that need them
      system.get('commit')?.send({ 
        type: 'commit.UPDATE_ROOT_DIRECTORY', 
        path: newPath,
        gitRepository: context.gitRepository,
        gitWatcher: context.gitWatcher
      });
      system.get('pr')?.send({ 
        type: 'pr.UPDATE_ROOT_DIRECTORY', 
        path: newPath,
        gitRepository: context.gitRepository
      });
      system.get('terminal')?.send({ type: 'terminal.UPDATE_CURRENT_DIRECTORY', path: newPath });
    },

    broadcastStartup: ({ system, context }) => {
      // Send CODE_STARTUP to all children that need it
      system.get('explorer')?.send({ type: 'CODE_STARTUP' });
      system.get('terminal')?.send({ type: 'CODE_STARTUP' });
      system.get('codeActions')?.send({ type: 'CODE_STARTUP' });
      system.get('codePrompts')?.send({ type: 'CODE_STARTUP' });
      
      // Send initial directory state to frontend
      const wrapped = emit(id, {
        type: 'CODE_STARTUP',
        data: {
          terminals: [], // Will be populated by terminal system
          rootDirectory: context.rootDirectory,
          currentDirectory: context.currentDirectory
        }
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
    
    restartGitWatcher: async ({ context }) => {
      if (!context.gitWatcher) {
        return
      }
      // Re-setup the watcher after directory change
      await context.gitWatcher.startWatching()
    }
  }
}).createMachine({
  id,
  initial: 'idle',
  context: (() => {
    // Get last opened directory from EARS
    const lastOpenedDir = repository.directoryQueries.getLastOpenedDirectory()
    const rootDir = lastOpenedDir?.path || null
    
    return {
      currentDirectory: rootDir,
      rootDirectory: rootDir,
      gitRepository: rootDir ? new GitRepository(rootDir) : null,
      gitWatcher: rootDir ? new GitWatcherService(rootDir) : null
    }
  })(),
  entry: ['spawnFeatureActors', 'setupGitWatcher'],
  states: {
    idle: {
      on: {
        CLIENT_CONNECTED: {
          actions: 'broadcastStartup',
        },
        // Handle SET_ROOT_DIRECTORY specially
        SET_ROOT_DIRECTORY: {
          actions: ['updateRootDirectory', 'notifyChildSystemsOfRootChange', 'restartGitWatcher']
        },
        // All other events get routed to children
        '*': {
          actions: 'routeEvent'
        }
      }
    }
  }
})