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
  | { type: 'FILE_CHANGED_EXTERNALLY'; data: FileChangeInfo }
  | { type: 'GIT_STATUS_CHANGED'; data: { timestamp: Date } }
  | { type: 'BASE_BRANCH'; data: { branch: string } }
  | { type: 'BRANCH_DIFF'; data: { files: GitStatusFile[]; baseBranch: string } }
  | { type: 'BRANCH_FILE_DIFF'; data: GitDiff }

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
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'copied'
  staged: boolean
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
  // PR related
  prFiles: GitStatusFile[]
  prBaseBranch: string
  prError: string | null
  isPrLoading: boolean
  selectedPrFile: GitStatusFile | null
  prDiff: GitDiff | null
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
  | { type: 'VIEW_DIFF'; path: string; staged: boolean }
  | { type: 'CLEAR_GIT_DIFF' }
  | { type: 'OPEN_DIFF_TAB'; file: GitStatusFile; diff: GitDiff }
  // PR events
  | { type: 'REFRESH_PR_STATUS' }
  | { type: 'SELECT_PR_FILE'; file: GitStatusFile }
  | { type: 'VIEW_PR_DIFF'; path: string }
  | { type: 'OPEN_PR_DIFF_TAB'; file: GitStatusFile; diff: GitDiff };

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
          // Update content for existing file (used for external refresh)
          return context.openFiles.map(f => 
            f.path === ev.data.path 
              ? { 
                  ...f, 
                  content: ev.data.content,
                  modified: false, // File is no longer modified after loading external content
                  externallyModified: false,
                  externalModificationTime: undefined,
                  pendingSaveConflict: false // Clear conflict after loading external changes
                }
              : f
          )
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
    closeFileOnBackend: ({ event }) => {
      const ev = event as { type: 'CLOSE_FILE'; path: string }
      sendToBackend('CLOSE_FILE', { path: ev.path })
    },
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
          f.path === ev.data.path 
            ? { 
                ...f, 
                modified: false,
                pendingSaveConflict: false,
                externallyModified: false,
                externalModificationTime: undefined
              } 
            : f
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
      } else if (ev.panel === 'pr') {
        sendToBackend('GET_BASE_BRANCH', {})
        sendToBackend('GET_BRANCH_DIFF', {})
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
    setGitLoading: assign({ isGitLoading: true }),
    clearGitDiff: assign({
      selectedGitFile: null,
      gitDiff: null
    }),
    openDiffTab: assign({
      openFiles: ({ context, event }) => {
        const ev = event as { type: 'OPEN_DIFF_TAB'; file: GitStatusFile; diff: GitDiff }
        const diffTabId = `diff:${ev.file.path}:${ev.file.staged ? 'staged' : 'unstaged'}`
        
        // Check if diff tab already exists
        const existingTab = context.openFiles.find(f => f.path === diffTabId)
        if (existingTab) {
          // Update the diff content
          return context.openFiles.map(f => 
            f.path === diffTabId 
              ? { ...f, gitDiff: ev.diff, gitFile: ev.file }
              : f
          )
        }
        
        // Add new diff tab
        return [...context.openFiles, {
          path: diffTabId,
          content: '', // Not used for diffs
          modified: false,
          isDiff: true,
          gitDiff: ev.diff,
          gitFile: ev.file
        }]
      },
      activeFilePath: ({ event }) => {
        const ev = event as { type: 'OPEN_DIFF_TAB'; file: GitStatusFile; diff: GitDiff }
        return `diff:${ev.file.path}:${ev.file.staged ? 'staged' : 'unstaged'}`
      }
    }),
    handleFileChangedExternally: assign({
      openFiles: ({ context, event }) => {
        const ev = event as { type: 'FILE_CHANGED_EXTERNALLY'; data: FileChangeInfo }
        return context.openFiles.map(f => {
          if (f.path === ev.data.path && !f.isDiff) {
            // Mark file as externally modified
            // If file has unsaved changes, also mark it as having a conflict
            return {
              ...f,
              externallyModified: true,
              externalModificationTime: ev.data.modifiedAt,
              pendingSaveConflict: f.modified // Only set conflict if file was modified
            }
          }
          return f
        })
      }
    }),
    refreshExternallyModifiedFile: ({ event, context }) => {
      const ev = event as { type: 'FILE_CHANGED_EXTERNALLY'; data: FileChangeInfo }
      const file = context.openFiles.find(f => f.path === ev.data.path)
      
      // Only refresh if file is not modified by user
      if (file && !file.modified && !file.isDiff) {
        sendToBackend('READ_FILE', { path: ev.data.path })
      }
    },
    // PR actions
    refreshPrStatus: () => {
      sendToBackend('GET_BASE_BRANCH', {})
      sendToBackend('GET_BRANCH_DIFF', {})
    },
    assignBaseBranch: assign({
      prBaseBranch: ({ event }) => {
        const ev = event as { type: 'BASE_BRANCH'; data: { branch: string } }
        return ev.data.branch
      },
      isPrLoading: false,
      prError: null
    }),
    assignBranchDiff: assign({
      prFiles: ({ event }) => {
        const ev = event as { type: 'BRANCH_DIFF'; data: { files: GitStatusFile[]; baseBranch: string } }
        return ev.data.files
      },
      prBaseBranch: ({ event }) => {
        const ev = event as { type: 'BRANCH_DIFF'; data: { files: GitStatusFile[]; baseBranch: string } }
        return ev.data.baseBranch
      },
      isPrLoading: false
    }),
    selectPrFile: assign({
      selectedPrFile: ({ event }) => {
        const ev = event as { type: 'SELECT_PR_FILE'; file: GitStatusFile }
        return ev.file
      }
    }),
    viewPrDiff: ({ event, context }) => {
      const ev = event as { type: 'VIEW_PR_DIFF'; path: string }
      sendToBackend('GET_BRANCH_FILE_DIFF', { 
        path: ev.path, 
        baseBranch: context.prBaseBranch 
      })
    },
    setPrLoading: assign({ isPrLoading: true }),
    openPrDiffTab: assign({
      openFiles: ({ context, event }) => {
        const ev = event as { type: 'OPEN_PR_DIFF_TAB'; file: GitStatusFile; diff: GitDiff }
        const diffTabId = `pr-diff:${ev.file.path}:${context.prBaseBranch}`
        
        // Check if diff tab already exists
        const existingTab = context.openFiles.find(f => f.path === diffTabId)
        if (existingTab) {
          // Update the diff content
          return context.openFiles.map(f => 
            f.path === diffTabId 
              ? { ...f, gitDiff: ev.diff, gitFile: ev.file }
              : f
          )
        }
        
        // Add new diff tab
        return [...context.openFiles, {
          path: diffTabId,
          content: '', // Not used for diffs
          modified: false,
          isDiff: true,
          gitDiff: ev.diff,
          gitFile: ev.file
        }]
      },
      activeFilePath: ({ event, context }) => {
        const ev = event as { type: 'OPEN_PR_DIFF_TAB'; file: GitStatusFile; diff: GitDiff }
        return `pr-diff:${ev.file.path}:${context.prBaseBranch}`
      }
    })
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
    commitMessage: '',
    // PR related
    prFiles: [],
    prBaseBranch: '',
    prError: null,
    isPrLoading: false,
    selectedPrFile: null,
    prDiff: null
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
          actions: ['closeFile', 'closeFileOnBackend']
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
          actions: [({ self, event }) => {
            const ev = event as { type: 'GIT_DIFF'; data: GitDiff }
            const context = self.getSnapshot().context
            if (context.selectedGitFile) {
              self.send({ 
                type: 'OPEN_DIFF_TAB', 
                file: context.selectedGitFile, 
                diff: ev.data 
              })
            }
          }]
        },
        OPEN_DIFF_TAB: {
          actions: ['openDiffTab']
        },
        UPDATE_COMMIT_MESSAGE: {
          actions: ['updateCommitMessage']
        },
        COMMIT: {
          actions: ['commit']
        },
        COMMIT_SUCCESS: {
          actions: ['handleCommitSuccess', 'refreshGitStatus']
        },
        CLEAR_GIT_DIFF: {
          actions: ['clearGitDiff']
        },
        FILE_CHANGED_EXTERNALLY: {
          actions: ['handleFileChangedExternally', 'refreshExternallyModifiedFile']
        },
        GIT_STATUS_CHANGED: {
          actions: [({ context }) => {
            // Only refresh git status if commit panel is active
            if (context.selectedPanel === 'commit') {
              sendToBackend('GET_GIT_STATUS', {})
            }
          }]
        },
        // PR events
        REFRESH_PR_STATUS: {
          actions: ['setPrLoading', 'refreshPrStatus']
        },
        BASE_BRANCH: {
          actions: ['assignBaseBranch']
        },
        BRANCH_DIFF: {
          actions: ['assignBranchDiff']
        },
        SELECT_PR_FILE: {
          actions: ['selectPrFile']
        },
        VIEW_PR_DIFF: {
          actions: ['viewPrDiff']
        },
        BRANCH_FILE_DIFF: {
          actions: [({ self, event }) => {
            const ev = event as { type: 'BRANCH_FILE_DIFF'; data: GitDiff }
            const context = self.getSnapshot().context
            if (context.selectedPrFile) {
              self.send({ 
                type: 'OPEN_PR_DIFF_TAB', 
                file: context.selectedPrFile, 
                diff: ev.data 
              })
            }
          }]
        },
        OPEN_PR_DIFF_TAB: {
          actions: ['openPrDiffTab']
        }
      }
    }
  }
}); 

export default codeState;
