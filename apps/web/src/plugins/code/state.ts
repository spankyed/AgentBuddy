import { setup, type ActorRefFrom, assign, enqueueActions } from 'xstate';
import breadcrumb from '@/core/breadcrumb';
import { trpc } from '@/core/trpc';
import { saveOpenTabs, loadPersistedTabs } from './utils/persisted-tabs';
import { loadRecentFiles, addRecentFile } from './utils/recent-files';
import type { OutgoingCodeEvents } from '@abuddy/api';

// Import child state machines
import { explorerState } from './features/explorer/state';
import { searchState } from './features/search/state';
import { commitState, type GitStatusFile, type GitDiff } from './features/commit/state';
import { pullRequestState } from './features/pull-request/state';
import { terminalState, type TerminalInfo } from './features/terminal/state';
import { actionsState, type ActionTab } from './features/actions/state';
import { promptsState, type PromptTab } from './features/prompts/state';

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
  openFiles: (OpenFile | TerminalTab | ActionTab | PromptTab)[]
  activeFilePath: string | null
  isLoading: boolean
  error: string | null
  selectedPanel: PanelType
  tabsRestored?: boolean
  pendingTabOrder?: Array<{ path: string; order: number }>  // Track desired tab order during restoration
  // Quick open state
  isQuickOpenVisible: boolean
  quickOpenQuery: string
  quickOpenResults: QuickOpenResult[]
  quickOpenSelectedIndex: number
  quickOpenLoading: boolean
  recentlyOpenedFiles: string[]
}

export interface QuickOpenResult {
  path: string
  relativePath: string
  name: string
  type: 'file' | 'directory'
  extension?: string
  score?: number
  matchRanges?: Array<[number, number]> // For highlighting matches
}

export type Event = 
  | OutgoingCodeEvents
  // Generic update event for child actors to update parent state
  | { type: 'UPDATE_STATE'; updates: Partial<Context> }
  | { type: 'PLUGIN_ACTIVATED' }
  | { type: 'SELECT_PANEL'; panel: PanelType }
  // Quick open events
  | { type: 'TOGGLE_QUICK_OPEN' }
  | { type: 'SHOW_QUICK_OPEN' }
  | { type: 'HIDE_QUICK_OPEN' }
  | { type: 'UPDATE_QUICK_OPEN_QUERY'; query: string }
  | { type: 'SELECT_QUICK_OPEN_RESULT'; index: number }
  | { type: 'OPEN_QUICK_OPEN_RESULT' };

export type CodeState = ActorRefFrom<typeof codeState>;

type PanelType = 'explorer' | 'search' | 'commit' | 'pr' | 'terminal' | 'actions' | 'prompts';

const STORAGE_KEY = 'code-plugin-root-directory'
const DEFAULT_DIR = '/Users/spankyed/Develop/Projects/AgentBuddy/'
const savedRootDirectory = localStorage.getItem(STORAGE_KEY) || DEFAULT_DIR

// Helper function to reorder tabs based on stored order
function reorderTabsByStoredOrder(
  openFiles: (OpenFile | TerminalTab | ActionTab | PromptTab)[],
  pendingOrder: Array<{ path: string; order: number }>
): (OpenFile | TerminalTab | ActionTab | PromptTab)[] | null {
  // Check if all pending tabs have been loaded
  const pendingPaths = pendingOrder.map(t => t.path)
  const loadedPaths = openFiles.map(f => f.path)
  const allTabsLoaded = pendingPaths.every(path => loadedPaths.includes(path))
  
  if (!allTabsLoaded) {
    // Not all tabs loaded yet, wait
    return null
  }
  
  // Create a map of path to order
  const orderMap = new Map(pendingOrder.map(t => [t.path, t.order]))
  
  // Sort tabs by their original order
  const sorted = [...openFiles].sort((a, b) => {
    const orderA = orderMap.get(a.path) ?? Number.MAX_SAFE_INTEGER
    const orderB = orderMap.get(b.path) ?? Number.MAX_SAFE_INTEGER
    return orderA - orderB
  })
  
  return sorted
}

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
    actionsState,
    promptsState
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
        enqueue.spawnChild('promptsState', { systemId: 'codePrompts' });
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
      const updates = { ...context, ...ev.updates }
      
      // Check if we need to reorder tabs based on pending order
      if (context.pendingTabOrder && ev.updates.openFiles && ev.updates.openFiles.length > 0) {
        const reorderedFiles = reorderTabsByStoredOrder(ev.updates.openFiles, context.pendingTabOrder)
        if (reorderedFiles) {
          updates.openFiles = reorderedFiles
          updates.pendingTabOrder = undefined // Clear pending order after applying
        }
      }
      
      return updates
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
      system.get('codePrompts')?.send({ type: 'codePrompts.REFRESH_LIST' });
    },
    
    restorePersistedTabs: enqueueActions(({ enqueue }) => {
      const persistedTabs = loadPersistedTabs()
      // console.log('[Code Plugin] Restoring persisted tabs:', persistedTabs)
      
      // Store the desired tab order
      const tabOrder = persistedTabs.map(tab => ({ path: tab.path, order: tab.order }))
      
      // Mark tabs as restored immediately (even if empty)
      enqueue.assign({
        tabsRestored: true,
        pendingTabOrder: tabOrder.length > 0 ? tabOrder : undefined
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
        const promptsActor = system.get('codePrompts')
        
        // Filter tabs by type
        const fileTabs = persistedTabs.filter(tab => tab.type === 'file')
        const terminalTabs = persistedTabs.filter(tab => tab.type === 'terminal')
        const actionTabs = persistedTabs.filter(tab => tab.type === 'action')
        const promptTabs = persistedTabs.filter(tab => tab.type === 'prompt')
        
        console.log('[Code Plugin] tabs to restore:', {
          actionTabs,
          fileTabs,
          terminalTabs,
          promptTabs,
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
        
        // Send prompt IDs to restore
        if (promptTabs.length > 0 && promptsActor) {
          const promptIds = promptTabs.map(tab => tab.promptId!)
          promptsActor.send({
            type: 'codePrompts.OPEN_TABS',
            promptIds
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
      system.get('codePrompts')?.send(event);
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
      } else if (ev.panel === 'prompts') {
        system.get('codePrompts')?.send({ type: 'codePrompts.LIST' });
      }
      return {
        ...context,
        selectedPanel: ev.panel
      };
    }),
    
    // Quick open actions
    showQuickOpen: assign({
      isQuickOpenVisible: true,
      quickOpenQuery: '',
      quickOpenResults: [],
      quickOpenSelectedIndex: 0,
      quickOpenLoading: true
    }),
    
    hideQuickOpen: assign({
      isQuickOpenVisible: false,
      quickOpenQuery: '',
      quickOpenResults: [],
      quickOpenSelectedIndex: 0,
      quickOpenLoading: false
    }),
    
    toggleQuickOpen: assign(({ context }) => ({
      ...context,
      isQuickOpenVisible: !context.isQuickOpenVisible,
      quickOpenQuery: context.isQuickOpenVisible ? '' : context.quickOpenQuery,
      quickOpenResults: context.isQuickOpenVisible ? [] : context.quickOpenResults,
      quickOpenSelectedIndex: 0,
      quickOpenLoading: context.isQuickOpenVisible ? false : true
    })),
    
    updateQuickOpenQuery: assign(({ event }) => {
      const ev = event as { type: 'UPDATE_QUICK_OPEN_QUERY'; query: string };
      return {
        quickOpenQuery: ev.query,
        quickOpenSelectedIndex: 0
      };
    }),
    
    selectQuickOpenResult: assign(({ event, context }) => {
      const ev = event as { type: 'SELECT_QUICK_OPEN_RESULT'; index: number };
      const maxIndex = Math.max(0, context.quickOpenResults.length - 1);
      return {
        quickOpenSelectedIndex: Math.max(0, Math.min(ev.index, maxIndex))
      };
    }),
    
    openQuickOpenResult: ({ context, system, self }) => {
      const result = context.quickOpenResults[context.quickOpenSelectedIndex];
      if (result && result.type === 'file') {
        // Track the file as recently opened
        const updatedRecentFiles = addRecentFile(context.recentlyOpenedFiles, result.path);
        self.send({
          type: 'UPDATE_STATE',
          updates: { recentlyOpenedFiles: updatedRecentFiles }
        });
        
        // Open file through explorer
        system.get('explorer')?.send({
          type: 'explorer.OPEN_FILE',
          path: result.path
        });
      }
    },
    
    requestQuickOpenFiles: ({ context, system }) => {
      system.get('explorer')?.send({
        type: 'explorer.QUICK_OPEN_SEARCH',
        rootDirectory: context.rootDirectory
      });
    },
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
    // Quick open state
    isQuickOpenVisible: false,
    quickOpenQuery: '',
    quickOpenResults: [],
    quickOpenSelectedIndex: 0,
    quickOpenLoading: false,
    recentlyOpenedFiles: loadRecentFiles(),
  },
  states: {
    canvas: {
      meta: breadcrumb('canvas', 'Editor', true),
      on: {
        // Broadcast CODE_STARTUP to all features
        CODE_STARTUP: {
          actions: ['broadcastToAllFeatures']
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
        },
        // Quick open events
        TOGGLE_QUICK_OPEN: {
          actions: ['toggleQuickOpen', 'requestQuickOpenFiles']
        },
        SHOW_QUICK_OPEN: {
          actions: ['showQuickOpen', 'requestQuickOpenFiles']
        },
        HIDE_QUICK_OPEN: {
          actions: ['hideQuickOpen']
        },
        UPDATE_QUICK_OPEN_QUERY: {
          actions: ['updateQuickOpenQuery']
        },
        SELECT_QUICK_OPEN_RESULT: {
          actions: ['selectQuickOpenResult']
        },
        OPEN_QUICK_OPEN_RESULT: {
          actions: ['openQuickOpenResult', 'hideQuickOpen']
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
