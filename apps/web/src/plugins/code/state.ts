import { setup, type ActorRefFrom, assign, enqueueActions } from 'xstate';
import breadcrumb from '@/core/breadcrumb';
import { trpc } from '@/core/trpc';
import { saveOpenTabs, loadPersistedTabs } from './utils/persisted-tabs';
import type { OutgoingCodeEvents } from '@abuddy/api';

// Import child state machines
import { explorerState } from './features/explorer/state';
import { searchState } from './features/search/state';
import { commitState } from './features/commit/state';
import { pullRequestState } from './features/pull-request/state';
import { terminalState } from './features/terminal/state';

// Search types
export interface SearchMatch {
  line: number
  column: number
  lineText: string
  matchStart: number
  matchEnd: number
}

export interface SearchResult {
  path: string
  matches: SearchMatch[]
  fileSize?: number
}

export interface SearchProgress {
  filesSearched: number
  totalFiles: number
  currentFile?: string
}


export const id = 'code' as const;

// Helper function to send events to backend
const sendToBackend = (type: string, data: any) => {
  trpc.bus.send.mutate({
    systemId: id as any,
    type: type as any,
    ...data
  } as any)
}

export interface FileInfo {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  modifiedAt?: Date
  extension?: string
}

export interface DirectoryContent {
  path: string
  files: FileInfo[]
}

export interface FileContent {
  path: string
  content: string
  encoding: string
}

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

// Git types
export interface GitStatusFile {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'copied' | 'typechange' | 'unmerged'
  staged: boolean
  originalPath?: string // For renames and copies
  score?: number // Rename/copy similarity score (0-100)
}

export interface GitDiff {
  path: string
  diff: string
  staged: boolean
  originalContent?: string
  modifiedContent?: string
}

// File watching types
export interface FileChangeInfo {
  path: string
  modifiedAt: Date
  changeType: 'add' | 'change' | 'unlink'
}

// Terminal types
export interface TerminalInfo {
  id: string
  title: string
  pid: number
  shell?: string
  cwd: string
  active: boolean
  cols: number
  rows: number
}

export interface TerminalTab extends OpenFile {
  isTerminal: true
  terminalInfo: TerminalInfo
}

export type Context = {
  rootDirectory: string
  currentDirectory: string
  openFiles: (OpenFile | TerminalTab)[]
  activeFilePath: string | null
  isLoading: boolean
  error: string | null
  selectedPanel: PanelType
}

// Generic update event for child actors to update parent state
export type Event = 
  | OutgoingCodeEvents
  | { type: 'UPDATE_STATE'; updates: Partial<Context> }
  | { type: 'PLUGIN_ACTIVATED' };

export type CodeState = ActorRefFrom<typeof codeState>;

type PanelType = 'explorer' | 'search' | 'commit' | 'pr' | 'terminal';

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
    terminalState
  },
  actions: {
    spawnFeatureActors: enqueueActions(({ enqueue }) => {
      enqueue.spawnChild('explorerState', { systemId: 'explorer' });
      enqueue.spawnChild('searchState', { systemId: 'search' });
      enqueue.spawnChild('commitState', { systemId: 'commit' });
      enqueue.spawnChild('pullRequestState', { systemId: 'pullRequest' });
      enqueue.spawnChild('terminalState', { systemId: 'terminal' });
    }),

    saveTabsAction: ({ context }) => {
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
      system.get('terminal')?.send({ type: 'terminal.LIST' });
    },
    routeEvent: ({ event, system }) => {
      const eventType = event.type;
      
      // Route based on prefix
      if (eventType.startsWith('explorer.')) {
        system.get('explorer')?.send(event);
      } else if (eventType.startsWith('search.')) {
        system.get('search')?.send(event);
      } else if (eventType.startsWith('commit.')) {
        system.get('commit')?.send(event);
      } else if (eventType.startsWith('pr.')) {
        system.get('pullRequest')?.send(event);
      } else if (eventType.startsWith('terminal.')) {
        system.get('terminal')?.send(event);
      }
      
      // Route backend events to appropriate child machines
      const backendEvents = [
        'FILE_CONTENT', 'FILE_SAVED', 'FILE_CHANGED_EXTERNALLY', 
        'CODE_ERROR', 'CURRENT_DIRECTORY', 'DIRECTORY_CHANGED',
        'CODE_STARTUP'
      ];
      
      if (backendEvents.includes(eventType)) {
        // File-related events go to explorer
        system.get('explorer')?.send(event);
        
        // CODE_STARTUP also needs to go to terminal for loading persisted tabs
        if (eventType === 'CODE_STARTUP') {
          const event_ = event as any
          if (event_.data?.terminals) {
            system.get('terminal')?.send({ 
              type: 'terminal.TERMINALS_LISTED', 
              terminals: event_.data.terminals
            });
          }
        }
      }
    },
  }
}).createMachine({
  id,
  initial: 'canvas',
  entry: 'spawnFeatureActors',
  context: {
    rootDirectory: savedRootDirectory,
    currentDirectory: savedRootDirectory,
    openFiles: [],
    activeFilePath: null,
    isLoading: false,
    error: null,
    selectedPanel: 'explorer' as PanelType
  },
  states: {
    canvas: {
      meta: breadcrumb('canvas', 'Editor', true),
      on: {
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

// Validation function for state updates
const validateStateUpdate = (updates: Partial<Context>): boolean => {
  // Validate that updates contain valid properties
  const validKeys = ['rootDirectory', 'currentDirectory', 'openFiles', 'activeFilePath', 'isLoading', 'error', 'selectedPanel']
  
  for (const key of Object.keys(updates)) {
    if (!validKeys.includes(key)) {
      console.warn(`Invalid state update key: ${key}`)
      return false
    }
  }
  
  // Validate specific update types
  if ('openFiles' in updates && !Array.isArray(updates.openFiles)) {
    console.warn('openFiles must be an array')
    return false
  }
  
  if ('activeFilePath' in updates && updates.activeFilePath !== null && typeof updates.activeFilePath !== 'string') {
    console.warn('activeFilePath must be null or string')
    return false
  }
  
  return true
}
