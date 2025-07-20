import { setup, type ActorRefFrom, assign } from 'xstate';
import breadcrumb from '@/core/breadcrumb';
import { trpc } from '@/core/trpc';

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

type OutgoingCodeEvents =
  | { type: 'FILES_LISTED'; data: DirectoryContent }
  | { type: 'FILE_CONTENT'; data: FileContent }
  | { type: 'FILE_SAVED'; data: { path: string } }
  | { type: 'FILE_CREATED'; data: { path: string } }
  | { type: 'FILE_DELETED'; data: { path: string } }
  | { type: 'FILE_RENAMED'; data: { oldPath: string; newPath: string } }
  | { type: 'DIRECTORY_CREATED'; data: { path: string } }
  | { type: 'FILE_INFO'; data: FileInfo }
  | { type: 'DIRECTORY_CHANGED'; data: { path: string } }
  | { type: 'CODE_ERROR'; data: { code: string; message: string; path?: string } }
  | { type: 'CURRENT_DIRECTORY'; data: { path: string } }
  | { type: 'SEARCH_RESULT'; data: SearchResult }
  | { type: 'SEARCH_PROGRESS'; data: SearchProgress }
  | { type: 'SEARCH_COMPLETE'; data: { results: SearchResult[]; totalMatches: number } }
  | { type: 'SEARCH_ERROR'; data: { message: string } }
  | { type: 'GIT_STATUS'; data: { files: GitStatusFile[]; branch: string } }
  | { type: 'GIT_DIFF'; data: GitDiff }
  | { type: 'FILES_STAGED'; data: { paths: string[] } }
  | { type: 'FILES_UNSTAGED'; data: { paths: string[] } }
  | { type: 'COMMIT_SUCCESS'; data: { message: string } }
  | { type: 'GIT_ERROR'; data: { message: string } }
  | { type: 'CURRENT_BRANCH'; data: { branch: string } }

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
}

// Git types
export interface GitStatusFile {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'copied'
  staged: boolean
}

export interface GitDiff {
  path: string
  diff: string
  staged: boolean
}

export type Context = {
  rootDirectory: string
  currentDirectory: string
  files: FileInfo[]
  openFiles: OpenFile[]
  activeFilePath: string | null
  isLoading: boolean
  error: string | null
  selectedPanel: PanelType
  // Search related
  searchQuery: string
  searchResults: SearchResult[]
  isSearching: boolean
  searchError: string | null
  searchProgress: SearchProgress | null
  searchOptions: {
    includePattern: string
    excludePattern: string
    caseSensitive: boolean
    wholeWord: boolean
    useRegex: boolean
    searchInCurrentDir: boolean
  }
  // Git related
  gitStatus: GitStatusFile[]
  gitBranch: string
  gitError: string | null
  isGitLoading: boolean
  selectedGitFile: GitStatusFile | null
  gitDiff: GitDiff | null
  commitMessage: string
}

export type Event = 
  | OutgoingCodeEvents
  | { type: 'SELECT_FILE'; path: string }
  | { type: 'CLOSE_FILE'; path: string }
  | { type: 'SAVE_FILE'; path: string; content: string }
  | { type: 'CREATE_FILE'; name: string }
  | { type: 'DELETE_FILE'; path: string }
  | { type: 'RENAME_FILE'; oldPath: string; newPath: string }
  | { type: 'SELECT_PANEL'; panel: PanelType }
  | { type: 'FILE_MODIFIED'; path: string; content: string }
  | { type: 'PLUGIN_ACTIVATED' }
  | { type: 'NAVIGATE_TO_DIRECTORY'; path: string }
  | { type: 'OPEN_FILE'; path: string }
  | { type: 'SET_ROOT_DIRECTORY'; path: string }
  // Search events
  | { type: 'START_SEARCH'; query: string }
  | { type: 'CANCEL_SEARCH' }
  | { type: 'CLEAR_SEARCH' }
  | { type: 'UPDATE_SEARCH_OPTIONS'; options: Partial<Context['searchOptions']> }
  | { type: 'OPEN_SEARCH_RESULT'; result: SearchResult; matchIndex: number }
  // Git events
  | { type: 'REFRESH_GIT_STATUS' }
  | { type: 'SELECT_GIT_FILE'; file: GitStatusFile }
  | { type: 'STAGE_FILES'; paths: string[] }
  | { type: 'UNSTAGE_FILES'; paths: string[] }
  | { type: 'UPDATE_COMMIT_MESSAGE'; message: string }
  | { type: 'COMMIT' }
  | { type: 'VIEW_DIFF'; path: string; staged: boolean };

export type CodeState = ActorRefFrom<typeof codeState>;

type PanelType = 'explorer' | 'search' | 'commit' | 'pr';

const STORAGE_KEY = 'code-plugin-root-directory'
const DEFAULT_DIR = '/Users/spankyed/Develop/Projects/AgentBuddy/'
const savedRootDirectory = localStorage.getItem(STORAGE_KEY) || DEFAULT_DIR

const codeState = setup({
  types: {
    context: {} as Context,
    events: {} as Event
  },
  actions: {
    assignFiles: assign({
      files: ({ event }) => {
        const ev = event as { type: 'FILES_LISTED'; data: DirectoryContent }
        return ev.data.files
      },
      isLoading: false,
      error: null
    }),
    assignFileContent: assign({
      openFiles: ({ context, event }) => {
        const ev = event as { type: 'FILE_CONTENT'; data: FileContent }
        const existingFile = context.openFiles.find(f => f.path === ev.data.path)
        if (existingFile) {
          return context.openFiles
        }
        return [...context.openFiles, {
          path: ev.data.path,
          content: ev.data.content,
          modified: false
        }]
      },
      activeFilePath: ({ event }) => {
        const ev = event as { type: 'FILE_CONTENT'; data: FileContent }
        return ev.data.path
      },
      isLoading: false
    }),
    assignCurrentDirectory: assign({
      currentDirectory: ({ event }) => {
        const ev = event as { type: 'CURRENT_DIRECTORY' | 'DIRECTORY_CHANGED'; data: { path: string } }
        return ev.data.path
      }
    }),
    assignError: assign({
      error: ({ event }) => {
        const ev = event as { type: 'CODE_ERROR'; data: { message: string } }
        return ev.data.message
      },
      isLoading: false
    }),
    setActiveFile: assign({
      activeFilePath: ({ event }) => {
        const ev = event as { type: 'SELECT_FILE'; path: string }
        return ev.path
      }
    }),
    closeFile: assign({
      openFiles: ({ context, event }) => {
        const ev = event as { type: 'CLOSE_FILE'; path: string }
        return context.openFiles.filter(f => f.path !== ev.path)
      },
      activeFilePath: ({ context, event }) => {
        const ev = event as { type: 'CLOSE_FILE'; path: string }
        if (context.activeFilePath === ev.path) {
          const remainingFiles = context.openFiles.filter(f => f.path !== ev.path)
          return remainingFiles.length > 0 ? remainingFiles[0].path : null
        }
        return context.activeFilePath
      }
    }),
    updateFileContent: assign({
      openFiles: ({ context, event }) => {
        const ev = event as { type: 'FILE_MODIFIED'; path: string; content: string }
        return context.openFiles.map(f => 
          f.path === ev.path ? { ...f, content: ev.content, modified: true } : f
        )
      }
    }),
    markFileSaved: assign({
      openFiles: ({ context, event }) => {
        const ev = event as { type: 'FILE_SAVED'; data: { path: string } }
        return context.openFiles.map(f => 
          f.path === ev.data.path ? { ...f, modified: false } : f
        )
      }
    }),
    selectPanel: assign({
      selectedPanel: ({ event }) => {
        const ev = event as { type: 'SELECT_PANEL'; panel: PanelType }
        return ev.panel
      }
    }),
    refreshGitStatusIfCommitPanel: ({ event }) => {
      const ev = event as { type: 'SELECT_PANEL'; panel: PanelType }
      if (ev.panel === 'commit') {
        sendToBackend('GET_GIT_STATUS', {})
      }
    },
    setLoading: assign({ isLoading: true, error: null }),
    navigateToDirectory: ({ event }) => {
      const ev = event as { type: 'NAVIGATE_TO_DIRECTORY'; path: string }
      sendToBackend('CHANGE_DIRECTORY', { path: ev.path })
      sendToBackend('LIST_FILES', { path: ev.path })
    },
    setRootDirectory: ({ event }) => {
      const ev = event as { type: 'SET_ROOT_DIRECTORY'; path: string }
      localStorage.setItem(STORAGE_KEY, ev.path)
      sendToBackend('CHANGE_DIRECTORY', { path: ev.path })
      sendToBackend('LIST_FILES', { path: ev.path })
    },
    assignRootDirectory: assign({
      rootDirectory: ({ event }) => {
        const ev = event as { type: 'SET_ROOT_DIRECTORY'; path: string }
        return ev.path
      },
      currentDirectory: ({ event }) => {
        const ev = event as { type: 'SET_ROOT_DIRECTORY'; path: string }
        return ev.path
      }
    }),
    openFile: ({ event }) => {
      const ev = event as { type: 'OPEN_FILE'; path: string }
      sendToBackend('READ_FILE', { path: ev.path })
    },
    requestInitialFiles: ({ context }) => {
      sendToBackend('LIST_FILES', { path: context.currentDirectory })
    },
    // Search actions
    startSearch: ({ event, context }) => {
      const ev = event as { type: 'START_SEARCH'; query: string }
      sendToBackend('SEARCH_FILES', {
        query: ev.query,
        path: context.searchOptions.searchInCurrentDir ? context.currentDirectory : context.rootDirectory,
        includePattern: context.searchOptions.includePattern || undefined,
        excludePattern: context.searchOptions.excludePattern || undefined,
        caseSensitive: context.searchOptions.caseSensitive,
        wholeWord: context.searchOptions.wholeWord,
        useRegex: context.searchOptions.useRegex
      })
    },
    cancelSearch: () => {
      sendToBackend('CANCEL_SEARCH', {})
    },
    assignSearchQuery: assign({
      searchQuery: ({ event }) => {
        const ev = event as { type: 'START_SEARCH'; query: string }
        return ev.query
      },
      isSearching: true,
      searchError: null,
      searchResults: []
    }),
    assignSearchResult: assign({
      searchResults: ({ context, event }) => {
        const ev = event as { type: 'SEARCH_RESULT'; data: SearchResult }
        return [...context.searchResults, ev.data]
      }
    }),
    assignSearchProgress: assign({
      searchProgress: ({ event }) => {
        const ev = event as { type: 'SEARCH_PROGRESS'; data: SearchProgress }
        return ev.data
      }
    }),
    assignSearchComplete: assign({
      isSearching: false,
      searchProgress: null
    }),
    assignSearchError: assign({
      searchError: ({ event }) => {
        const ev = event as { type: 'SEARCH_ERROR'; data: { message: string } }
        return ev.data.message
      },
      isSearching: false,
      searchProgress: null
    }),
    clearSearch: assign({
      searchQuery: '',
      searchResults: [],
      searchError: null,
      searchProgress: null
    }),
    updateSearchOptions: assign({
      searchOptions: ({ context, event }) => {
        const ev = event as { type: 'UPDATE_SEARCH_OPTIONS'; options: Partial<Context['searchOptions']> }
        return { ...context.searchOptions, ...ev.options }
      }
    }),
    openSearchResult: ({ event }) => {
      const ev = event as { type: 'OPEN_SEARCH_RESULT'; result: SearchResult; matchIndex: number }
      sendToBackend('READ_FILE', { path: ev.result.path })
    },
    // Git actions
    refreshGitStatus: () => {
      sendToBackend('GET_GIT_STATUS', {})
    },
    assignGitStatus: assign({
      gitStatus: ({ event }) => {
        const ev = event as { type: 'GIT_STATUS'; data: { files: GitStatusFile[]; branch: string } }
        return ev.data.files
      },
      gitBranch: ({ event }) => {
        const ev = event as { type: 'GIT_STATUS'; data: { files: GitStatusFile[]; branch: string } }
        return ev.data.branch
      },
      isGitLoading: false,
      gitError: null
    }),
    assignGitError: assign({
      gitError: ({ event }) => {
        const ev = event as { type: 'GIT_ERROR'; data: { message: string } }
        return ev.data.message
      },
      isGitLoading: false
    }),
    selectGitFile: assign({
      selectedGitFile: ({ event }) => {
        const ev = event as { type: 'SELECT_GIT_FILE'; file: GitStatusFile }
        return ev.file
      }
    }),
    stageFiles: ({ event }) => {
      const ev = event as { type: 'STAGE_FILES'; paths: string[] }
      sendToBackend('STAGE_FILES', { paths: ev.paths })
    },
    unstageFiles: ({ event }) => {
      const ev = event as { type: 'UNSTAGE_FILES'; paths: string[] }
      sendToBackend('UNSTAGE_FILES', { paths: ev.paths })
    },
    assignGitDiff: assign({
      gitDiff: ({ event }) => {
        const ev = event as { type: 'GIT_DIFF'; data: GitDiff }
        return ev.data
      }
    }),
    viewDiff: ({ event }) => {
      const ev = event as { type: 'VIEW_DIFF'; path: string; staged: boolean }
      sendToBackend('GET_GIT_DIFF', { path: ev.path, staged: ev.staged })
    },
    updateCommitMessage: assign({
      commitMessage: ({ event }) => {
        const ev = event as { type: 'UPDATE_COMMIT_MESSAGE'; message: string }
        return ev.message
      }
    }),
    commit: ({ context }) => {
      if (context.commitMessage.trim()) {
        sendToBackend('COMMIT', { message: context.commitMessage })
      }
    },
    handleCommitSuccess: assign({
      commitMessage: '',
      selectedGitFile: null,
      gitDiff: null
    }),
    setGitLoading: assign({ isGitLoading: true })
  }
}).createMachine({
  id,
  initial: 'canvas',
  context: {
    rootDirectory: savedRootDirectory,
    currentDirectory: savedRootDirectory,
    files: [],
    openFiles: [],
    activeFilePath: null,
    isLoading: false,
    error: null,
    selectedPanel: 'explorer',
    // Search related
    searchQuery: '',
    searchResults: [],
    isSearching: false,
    searchError: null,
    searchProgress: null,
    searchOptions: {
      includePattern: '',
      excludePattern: '',
      caseSensitive: false,
      wholeWord: false,
      useRegex: false,
      searchInCurrentDir: false
    },
    // Git related
    gitStatus: [],
    gitBranch: '',
    gitError: null,
    isGitLoading: false,
    selectedGitFile: null,
    gitDiff: null,
    commitMessage: ''
  },
  states: {
    canvas: {
      meta: breadcrumb('canvas', 'Editor', true),
      on: {
        PLUGIN_ACTIVATED: {
          actions: ['setLoading', 'requestInitialFiles']
        },
        CURRENT_DIRECTORY: {
          actions: ['assignCurrentDirectory']
        },
        DIRECTORY_CHANGED: {
          actions: ['assignCurrentDirectory']
        },
        FILES_LISTED: {
          actions: ['assignFiles']
        },
        FILE_CONTENT: {
          actions: ['assignFileContent']
        },
        CODE_ERROR: {
          actions: ['assignError']
        },
        FILE_SAVED: {
          actions: ['markFileSaved']
        },
        SELECT_FILE: {
          actions: ['setActiveFile']
        },
        CLOSE_FILE: {
          actions: ['closeFile']
        },
        FILE_MODIFIED: {
          actions: ['updateFileContent']
        },
        SELECT_PANEL: {
          actions: ['selectPanel', 'refreshGitStatusIfCommitPanel']
        },
        NAVIGATE_TO_DIRECTORY: {
          actions: ['navigateToDirectory']
        },
        OPEN_FILE: {
          actions: ['openFile']
        },
        SET_ROOT_DIRECTORY: {
          actions: ['assignRootDirectory', 'setRootDirectory']
        },
        // Search events
        START_SEARCH: {
          actions: ['assignSearchQuery', 'startSearch']
        },
        CANCEL_SEARCH: {
          actions: ['cancelSearch']
        },
        CLEAR_SEARCH: {
          actions: ['clearSearch']
        },
        UPDATE_SEARCH_OPTIONS: {
          actions: ['updateSearchOptions']
        },
        SEARCH_RESULT: {
          actions: ['assignSearchResult']
        },
        SEARCH_PROGRESS: {
          actions: ['assignSearchProgress']
        },
        SEARCH_COMPLETE: {
          actions: ['assignSearchComplete']
        },
        SEARCH_ERROR: {
          actions: ['assignSearchError']
        },
        OPEN_SEARCH_RESULT: {
          actions: ['openSearchResult']
        },
        // Git events
        REFRESH_GIT_STATUS: {
          actions: ['setGitLoading', 'refreshGitStatus']
        },
        GIT_STATUS: {
          actions: ['assignGitStatus']
        },
        GIT_ERROR: {
          actions: ['assignGitError']
        },
        SELECT_GIT_FILE: {
          actions: ['selectGitFile']
        },
        STAGE_FILES: {
          actions: ['stageFiles']
        },
        UNSTAGE_FILES: {
          actions: ['unstageFiles']
        },
        FILES_STAGED: {
          actions: ['refreshGitStatus']
        },
        FILES_UNSTAGED: {
          actions: ['refreshGitStatus']
        },
        VIEW_DIFF: {
          actions: ['viewDiff']
        },
        GIT_DIFF: {
          actions: ['assignGitDiff']
        },
        UPDATE_COMMIT_MESSAGE: {
          actions: ['updateCommitMessage']
        },
        COMMIT: {
          actions: ['commit']
        },
        COMMIT_SUCCESS: {
          actions: ['handleCommitSuccess', 'refreshGitStatus']
        }
      }
    }
  }
}); 

export default codeState;
