import { setup, type ActorRefFrom, assign, enqueueActions } from 'xstate';
import breadcrumb from '@/core/breadcrumb';
import { trpc } from '@/core/trpc';
import { saveOpenTabs, loadPersistedTabs } from './utils/persisted-tabs';
import type { OutgoingCodeEvents } from '@abuddy/api';

// Import child state machines
import { explorerState } from './features/explorer/state';
import { searchState } from './features/search/state';
import { commitState, type GitStatusFile, type GitDiff } from './features/commit/state';
import { pullRequestState } from './features/pull-request/state';
import { terminalState, type TerminalInfo } from './features/terminal/state';
import { actionsState, type ActionTab } from './features/actions/state';

export const id = 'code' as const;
export interface OpenFile {
  path: string
  content: string
  modified: boolean
  isDiff?: boolean
  gitDiff?: GitDiff
  gitFile?: GitStatusFile
  externallyModified?: boolean
  externalModificationTime?: Date
  pendingSaveConflict?: boolean
}

export interface TerminalTab extends OpenFile {
  isTerminal: true
  terminalInfo: TerminalInfo
}

export type Context = {
  rootDirectory: string
  currentDirectory: string
  openFiles: (OpenFile | TerminalTab | ActionTab)[]
  activeFilePath: string | null
  isLoading: boolean
  error: string | null
  selectedPanel: PanelType
  tabsRestored?: boolean
}

export type Event = 
  | OutgoingCodeEvents
  // Generic update event for child actors to update parent state
  | { type: 'UPDATE_STATE'; updates: Partial<Context> }
  | { type: 'PLUGIN_ACTIVATED' }
  | { type: 'SELECT_PANEL'; panel: PanelType };

export type CodeState = ActorRefFrom<typeof codeState>;

type PanelType = 'explorer' | 'search' | 'commit' | 'pr' | 'terminal' | 'actions';

const STORAGE_KEY = 'code-plugin-root-directory'
const DEFAULT_DIR = '/Users/spankyed/Develop/Projects/AgentBuddy/'
const savedRootDirectory = localStorage.getItem(STORAGE_KEY) || DEFAULT_DIR

const codeState = setup({
  types: {
    context: {} as Context,
    events: {} as Event
  },
  actors: {
    explorerState,
    searchState,
    commitState,
    pullRequestState,
    terminalState,
    actionsState
  },
  actions: {
    spawnFeatureActors: enqueueActions(({ enqueue, context }) => {
      // Only spawn if not already spawned
        enqueue.spawnChild('explorerState', { systemId: 'explorer' });
        enqueue.spawnChild('searchState', { systemId: 'search' });
        enqueue.spawnChild('commitState', { systemId: 'commit' });
        enqueue.spawnChild('pullRequestState', { systemId: 'pr' });
        enqueue.spawnChild('terminalState', { systemId: 'terminal' });
        enqueue.spawnChild('actionsState', { systemId: 'codeActions' });
    }),

    saveTabsAction: ({ context }) => {
      // Don't save tabs until they've been restored (to avoid overwriting with empty array)
      if (!context.tabsRestored) {
        return
      }
      saveOpenTabs(context.openFiles)
    },
    updateState: assign(({ event, context }) => {
      const ev = event as { type: 'UPDATE_STATE'; updates: Partial<Context> }
      return { ...context, ...ev.updates }
    }),
    assignFiles: assign({
      isLoading: false,
      error: null
    }),
    initializePlugin: ({ context, system }) => {
      // Initialize child machines with root directory
      system.get('explorer')?.send({ type: 'explorer.INITIALIZE', rootDirectory: context.rootDirectory });
      system.get('terminal')?.send({ type: 'terminal.REFRESH_LIST' });
      system.get('codeActions')?.send({ type: 'codeActions.REFRESH_LIST' });
    },
    
    restorePersistedTabs: enqueueActions(({ enqueue }) => {
      const persistedTabs = loadPersistedTabs()
      // console.log('[Code Plugin] Restoring persisted tabs:', persistedTabs)
      
      // Mark tabs as restored immediately (even if empty)
      enqueue.assign({
        tabsRestored: true
      })
      
      // If no persisted tabs, we're done
      if (persistedTabs.length === 0) {
        return
      }
      
      // Restore tabs
      enqueue(({ system }) => {
        const explorerActor = system.get('explorer')
        const terminalActor = system.get('terminal')
        const actionsActor = system.get('codeActions')
        
        // Filter tabs by type
        const fileTabs = persistedTabs.filter(tab => tab.type === 'file')
        const terminalTabs = persistedTabs.filter(tab => tab.type === 'terminal')
        const actionTabs = persistedTabs.filter(tab => tab.type === 'action')
        
        console.log('[Code Plugin] tabs to restore:', {
          actionTabs,
          fileTabs,
          terminalTabs,
        })
        
        // Send file paths to restore
        if (fileTabs.length > 0 && explorerActor) {
          const filePaths = fileTabs.map(tab => tab.path)
          explorerActor.send({ 
            type: 'explorer.OPEN_FILES', 
            paths: filePaths 
          })
        }
        
        // Send terminal IDs to restore
        if (terminalTabs.length > 0 && terminalActor) {
          const terminalIds = terminalTabs.map(tab => tab.terminalId!)
          terminalActor.send({ 
            type: 'terminal.OPEN_TABS', 
            terminalIds 
          })
        }
        
        // Send action IDs to restore
        if (actionTabs.length > 0 && actionsActor) {
          const actionIds = actionTabs.map(tab => tab.actionId!)
          actionsActor.send({
            type: 'codeActions.OPEN_TABS',
            actionIds
          })
        }
      })
    }),
    broadcastToAllFeatures: ({ event, system }) => {
      system.get('explorer')?.send(event);
      system.get('search')?.send(event);
      system.get('commit')?.send(event);
      system.get('pr')?.send(event);
      system.get('terminal')?.send(event);
      system.get('codeActions')?.send(event);
    },

    routeEvent: ({ event, system }) => {
      const eventType = event.type;
      
      // Route based on prefix - prefix matches system ID
      if (eventType.includes('.')) {
        const [prefix] = eventType.split('.');
        system.get(prefix)?.send(event);
      }
    },
    
    selectPanel: assign(({
      event,
      context,
      system
    }) => {
      const ev = event as { type: 'SELECT_PANEL'; panel: PanelType };
      
      // Notify child machines if needed
      if (ev.panel === 'commit') {
        system.get('commit')?.send({ type: 'commit.REFRESH_STATUS' });
      } else if (ev.panel === 'pr') {
        system.get('pr')?.send({ type: 'pr.REFRESH_STATUS' });
      } else if (ev.panel === 'terminal') {
        system.get('terminal')?.send({ type: 'terminal.REFRESH_LIST' });
      } else if (ev.panel === 'actions') {
        system.get('codeActions')?.send({ type: 'codeActions.LIST' });
      }
      return {
        ...context,
        selectedPanel: ev.panel
      };
    }),
  }
}).createMachine({
  id,
  initial: 'canvas',
  entry: ['spawnFeatureActors', 'restorePersistedTabs'],
  context: {
    rootDirectory: savedRootDirectory,
    currentDirectory: savedRootDirectory,
    openFiles: [], // Don't load tabs here - wait for PLUGIN_ACTIVATED
    activeFilePath: null,
    isLoading: false,
    error: null,
    selectedPanel: 'explorer' as PanelType,
  },
  states: {
    canvas: {
      meta: breadcrumb('canvas', 'Editor', true),
      on: {
        // Broadcast CODE_STARTUP to all features
        CODE_STARTUP: {
          actions: ['broadcastToAllFeatures']
        },
        // Route actions events to actions state machine
        ACTIONS_STARTUP: {
          actions: ({ system, event }) => system.get('codeActions')?.send(event)
        },
        ACTION_SELECTED: {
          actions: ({ system, event }) => system.get('codeActions')?.send(event)
        },
        ACTION_UPDATED: {
          actions: ({ system, event }) => system.get('codeActions')?.send(event)
        },
        ACTIONS_PAGE_LOADED: {
          actions: ({ system, event }) => system.get('codeActions')?.send(event)
        },
        // Route events to child machines
        '*': {
          actions: ['routeEvent']
        },
        // Simple state update from child machines
        UPDATE_STATE: {
          actions: ['updateState', 'saveTabsAction']
        },
        // Plugin initialization
        PLUGIN_ACTIVATED: {
          actions: ['initializePlugin']
        },
        // Panel selection
        SELECT_PANEL: {
          actions: ['selectPanel']
        }
      }
    }
  }
});

export default codeState;

// Type definitions for parent-child communication
export interface StateUpdate {
  type: 'UPDATE_STATE'
  updates: Partial<Context>
}
