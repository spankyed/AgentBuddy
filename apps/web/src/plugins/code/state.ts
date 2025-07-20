import { setup, type ActorRefFrom, assign } from 'xstate';
import breadcrumb from '@/core/breadcrumb';
import { trpc } from '@/core/trpc';

// Temporary type definition until backend builds
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

export const id = 'code' as const;

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

export type Context = {
  currentDirectory: string
  rootDirectory: string
  files: FileInfo[]
  openFiles: OpenFile[]
  activeFilePath: string | null
  isLoading: boolean
  error: string | null
  selectedPanel: 'explorer' | 'search' | 'commit' | 'pr'
}

export type Event = 
  | OutgoingCodeEvents
  | { type: 'SELECT_FILE'; path: string }
  | { type: 'CLOSE_FILE'; path: string }
  | { type: 'SAVE_FILE'; path: string; content: string }
  | { type: 'CREATE_FILE'; name: string }
  | { type: 'DELETE_FILE'; path: string }
  | { type: 'RENAME_FILE'; oldPath: string; newPath: string }
  | { type: 'CHANGE_DIRECTORY'; path: string }
  | { type: 'SELECT_PANEL'; panel: 'explorer' | 'search' | 'commit' | 'pr' }
  | { type: 'FILE_MODIFIED'; path: string; content: string }
  | { type: 'REFRESH_FILES' }
  | { type: 'PLUGIN_ACTIVATED' }
  | { type: 'PLUGIN_DEACTIVATED' }
  | { type: 'SET_ROOT_DIRECTORY'; path: string }
  | { type: 'NAVIGATE_TO_DIRECTORY'; path: string }
  | { type: 'OPEN_FILE'; path: string }
  | { type: 'REQUEST_DIRECTORY_CHANGE'; path: string };

export type CodeState = ActorRefFrom<typeof codeState>;

// Load root directory from localStorage
const STORAGE_KEY = 'code-plugin-root-directory'
const savedRootDirectory = localStorage.getItem(STORAGE_KEY) || '/Users/spankyed/Develop/Projects/AgentBuddy/'

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
        const ev = event as { type: 'SELECT_PANEL'; panel: 'explorer' | 'search' | 'commit' | 'pr' }
        return ev.panel
      }
    }),
    setLoading: assign({
      isLoading: true,
      error: null
    }),
    setRootDirectory: ({ event }) => {
      const ev = event as { type: 'SET_ROOT_DIRECTORY'; path: string }
      // Save to localStorage
      localStorage.setItem(STORAGE_KEY, ev.path)
      // Send to backend to list files in the new root
      trpc.bus.send.mutate({
        systemId: id as any,
        type: 'LIST_FILES' as any,
        path: ev.path
      } as any)
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
    // Action to navigate to a directory
    navigateToDirectory: ({ event }) => {
      const ev = event as { type: 'NAVIGATE_TO_DIRECTORY'; path: string }
      // Change directory
      trpc.bus.send.mutate({
        systemId: id as any,
        type: 'CHANGE_DIRECTORY' as any,
        path: ev.path
      } as any)
      // List files
      trpc.bus.send.mutate({
        systemId: id as any,
        type: 'LIST_FILES' as any,
        path: ev.path
      } as any)
    },
    // Action to open a file or directory
    openFile: ({ event }) => {
      const ev = event as { type: 'OPEN_FILE'; path: string }
      trpc.bus.send.mutate({
        systemId: id as any,
        type: 'READ_FILE' as any,
        path: ev.path
      } as any)
    },
    // Action to request directory change
    requestDirectoryChange: ({ event }) => {
      const ev = event as { type: 'REQUEST_DIRECTORY_CHANGE'; path: string }
      // Change directory
      trpc.bus.send.mutate({
        systemId: id as any,
        type: 'CHANGE_DIRECTORY' as any,
        path: ev.path
      } as any)
      // List files
      trpc.bus.send.mutate({
        systemId: id as any,
        type: 'LIST_FILES' as any,
        path: ev.path
      } as any)
    },
    // Action to list files on plugin activation
    requestInitialFiles: ({ context }) => {
      trpc.bus.send.mutate({
        systemId: id as any,
        type: 'LIST_FILES' as any,
        path: context.currentDirectory
      } as any)
    }
  }
}).createMachine({
  id,
  initial: 'canvas',
  context: {
    currentDirectory: savedRootDirectory,
    rootDirectory: savedRootDirectory,
    files: [],
    openFiles: [],
    activeFilePath: null,
    isLoading: false,
    error: null,
    selectedPanel: 'explorer'
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
          actions: ['selectPanel']
        },
        SET_ROOT_DIRECTORY: {
          actions: ['assignRootDirectory', 'setRootDirectory']
        },
        NAVIGATE_TO_DIRECTORY: {
          actions: ['navigateToDirectory']
        },
        OPEN_FILE: {
          actions: ['openFile']
        },
        REQUEST_DIRECTORY_CHANGE: {
          actions: ['requestDirectoryChange']
        }
      }
    }
  }
}); 

export default codeState;
