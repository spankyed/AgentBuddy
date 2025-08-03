import { setup, enqueueActions, assign } from 'xstate'
import { systemBus, fromSystem } from '@/core/utils/event-helpers'
import { z } from 'zod'
import { safeEvents } from '@/core/utils/actor-helpers'
import { SystemEvents } from '@/systems/backend'
import type { MergeReceivable } from '@/core/utils/event-helpers'
import { getGitRepositoryRoot } from './utils/git-root'

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
  | { type: 'CODE_STARTUP'; data: { terminals: TerminalInfo[] } }

// Import only the type needed for broadcast event
import { TerminalInfo } from './types'

export const incomingSystemEvents = fromSystem(IncomingCodeEvents)<OutgoingCodeEvents, typeof id>()

type CodeInternalEvents = SystemEvents
type ReceivableEvents = MergeReceivable<typeof IncomingCodeEvents, CodeInternalEvents>

export interface Context {
  currentDirectory: string
  rootDirectory: string
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
      // Spawn all child systems with input
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
          rootDirectory: context.rootDirectory
        }
      });
      enqueue.spawnChild('pullRequestSystem', { 
        systemId: 'pr',
        input: {
          rootDirectory: context.rootDirectory
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

    handleChangeDirectory: ({ event, system }) => {
      system.get('explorer')?.send(event);
      system.get('terminal')?.send({ 
        type: 'terminal.UPDATE_CURRENT_DIRECTORY', 
        path: (event as any).path 
      });
    },

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
        return ev.path
      },
      currentDirectory: ({ event }) => {
        const ev = typeOf('SET_ROOT_DIRECTORY', event)
        return ev.path
      }
    }),

    notifyChildSystemsOfRootChange: ({ event, system }) => {
      const ev = typeOf('SET_ROOT_DIRECTORY', event)
      const newPath = ev.path
      
      // Update child systems
      system.get('explorer')?.send({ type: 'explorer.SET_ROOT_DIRECTORY', path: newPath });
      system.get('search')?.send({ type: 'search.UPDATE_ROOT_DIRECTORY', path: newPath });
      system.get('commit')?.send({ type: 'commit.UPDATE_ROOT_DIRECTORY', path: newPath });
      system.get('pr')?.send({ type: 'pr.UPDATE_ROOT_DIRECTORY', path: newPath });
      system.get('terminal')?.send({ type: 'terminal.UPDATE_CURRENT_DIRECTORY', path: newPath });
    },

    broadcastStartup: ({ system }) => {
      // Send CODE_STARTUP to all children that need it
      system.get('explorer')?.send({ type: 'CODE_STARTUP' });
      system.get('terminal')?.send({ type: 'CODE_STARTUP' });
      system.get('codeActions')?.send({ type: 'CODE_STARTUP' });
      system.get('codePrompts')?.send({ type: 'CODE_STARTUP' });
    },
  }
}).createMachine({
  id,
  initial: 'idle',
  context: (() => {
    const rootDir = getGitRepositoryRoot()
    return {
      currentDirectory: rootDir,
      rootDirectory: rootDir,
    }
  })(),
  entry: 'spawnFeatureActors',
  states: {
    idle: {
      on: {
        CLIENT_CONNECTED: {
          actions: 'broadcastStartup',
        },
        // Handle SET_ROOT_DIRECTORY specially
        SET_ROOT_DIRECTORY: {
          actions: ['updateRootDirectory', 'notifyChildSystemsOfRootChange']
        },
        // Handle explorer.CHANGE_DIRECTORY specially to sync with terminal
        'explorer.CHANGE_DIRECTORY': {
          actions: 'handleChangeDirectory'
        },
        // All other events get routed to children
        '*': {
          actions: 'routeEvent'
        }
      }
    }
  }
})