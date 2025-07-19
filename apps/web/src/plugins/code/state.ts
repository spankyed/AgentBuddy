import { setup, type ActorRefFrom, assign } from 'xstate';
import breadcrumb from '@/core/breadcrumb';

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
  | { type: 'PLUGIN_DEACTIVATED' };

export type CodeState = ActorRefFrom<typeof codeState>;

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
        const ev = event as { type: 'CURRENT_DIRECTORY'; data: { path: string } }
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
    })
  }
}).createMachine({
  id,
  initial: 'canvas',
  context: {
    currentDirectory: '.',
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
          actions: ['setLoading']
        },
        CURRENT_DIRECTORY: {
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
        }
      }
    }
  }
}); 

export default codeState;
