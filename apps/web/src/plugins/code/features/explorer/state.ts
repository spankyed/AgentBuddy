import { setup, assign, enqueueActions } from 'xstate';
import { trpc } from '@/core/trpc';
import type { FileInfo } from '../../state';
import { updateParentState, getParentContext } from '../../utils/parent-communication';

const sendToBackend = (type: string, data: any) => {
  trpc.bus.send.mutate({
    systemId: 'code' as any,
    type: type as any,
    ...data
  } as any)
}

export interface Context {
  files: FileInfo[]
  isLoading: boolean
  error: string | null
  rootDirectory: string
  currentDirectory: string
}

export type Event = 
  | { type: 'explorer.INITIALIZE'; rootDirectory: string }
  | { type: 'explorer.LIST_FILES'; path: string }
  | { type: 'explorer.CREATE_FILE'; name: string }
  | { type: 'explorer.DELETE_FILE'; path: string }
  | { type: 'explorer.RENAME_FILE'; oldPath: string; newPath: string }
  | { type: 'explorer.OPEN_FILE'; path: string }
  | { type: 'explorer.NAVIGATE_TO_DIRECTORY'; path: string }
  | { type: 'explorer.SET_ROOT_DIRECTORY'; path: string }
  | { type: 'explorer.FILES_LISTED'; data: { path: string; files: FileInfo[] } }
  | { type: 'explorer.FILE_DELETED'; path: string }
  | { type: 'explorer.FILE_RENAMED'; oldPath: string; newPath: string }
  | { type: 'explorer.ERROR'; message: string }
  // Backend events that affect file state (now with explorer. prefix)
  | { type: 'explorer.FILE_CONTENT'; data: { path: string; content: string; encoding: string } }
  | { type: 'explorer.FILE_SAVED'; data: { path: string } }
  | { type: 'explorer.FILE_CHANGED_EXTERNALLY'; data: { path: string; modifiedAt: Date; changeType: 'add' | 'change' | 'unlink' } }
  | { type: 'explorer.CODE_ERROR'; data: { message: string } }
  | { type: 'explorer.CURRENT_DIRECTORY'; data: { path: string; rootDirectory: string } }
  | { type: 'explorer.DIRECTORY_CHANGED'; data: { path: string } }
  // Broadcast events
  | { type: 'CODE_STARTUP'; data: any };

export const explorerState = setup({
  types: {
    context: {} as Context,
    events: {} as Event
  },
  actions: {
    setLoading: assign({ isLoading: true, error: null }),
    
    handleFileContent: ({ event, self }) => {
      const ev = event as { type: 'explorer.FILE_CONTENT'; data: { path: string; content: string; encoding: string } }
      const parentContext = getParentContext(self)
      const openFiles = parentContext?.openFiles || []
      const existingFile = openFiles.find((f: any) => f.path === ev.data.path)
      
      let newOpenFiles
      if (existingFile) {
        // Update content for existing file
        newOpenFiles = openFiles.map((f: any) => 
          f.path === ev.data.path 
            ? { 
                ...f, 
                content: ev.data.content,
                modified: false,
                externallyModified: false,
                externalModificationTime: undefined,
                pendingSaveConflict: false
              }
            : f
        )
      } else {
        // Add new file
        newOpenFiles = [...openFiles, {
          path: ev.data.path,
          content: ev.data.content,
          modified: false
        }]
      }
      
      // Update parent state
      updateParentState(self, {
        openFiles: newOpenFiles,
        activeFilePath: ev.data.path,
        isLoading: false
      })
    },
    
    handleFileSaved: ({ event, self }) => {
      const ev = event as { type: 'explorer.FILE_SAVED'; data: { path: string } }
      const parentContext = getParentContext(self)
      const newOpenFiles = parentContext?.openFiles?.map((f: any) => 
        f.path === ev.data.path 
          ? { 
              ...f, 
              modified: false,
              pendingSaveConflict: false,
              externallyModified: false,
              externalModificationTime: undefined
            } 
          : f
      ) || []
      
      updateParentState(self, { openFiles: newOpenFiles })
    },
    
    handleFileChangedExternally: ({ event, self }) => {
      const ev = event as { type: 'explorer.FILE_CHANGED_EXTERNALLY'; data: { path: string; modifiedAt: Date; changeType: 'add' | 'change' | 'unlink' } }
      const parentContext = getParentContext(self)
      const openFiles = parentContext?.openFiles || []
      const file = openFiles.find((f: any) => f.path === ev.data.path)
      
      if (file && !file.isDiff) {
        const newOpenFiles = openFiles.map((f: any) => {
          if (f.path === ev.data.path && !f.isDiff) {
            return {
              ...f,
              externallyModified: true,
              externalModificationTime: ev.data.modifiedAt,
              pendingSaveConflict: f.modified
            }
          }
          return f
        })
        
        updateParentState(self, { openFiles: newOpenFiles })
        
        // Only refresh if file is not modified by user
        if (!file.modified) {
          sendToBackend('READ_FILE', { path: ev.data.path })
        }
      }
    },
    
    handleCodeError: ({ event, self }) => {
      const ev = event as { type: 'explorer.CODE_ERROR'; data: { message: string } }
      updateParentState(self, { error: ev.data.message, isLoading: false })
    },
    
    handleCurrentDirectory: enqueueActions(({ enqueue, event, self }) => {
      const ev = event as { type: 'explorer.CURRENT_DIRECTORY'; data: { path: string; rootDirectory: string } }
      enqueue.assign({
        currentDirectory: ev.data.path
      })
      enqueue(() => {
        updateParentState(self, { currentDirectory: ev.data.path })
      })
    }),
    
    handleDirectoryChanged: enqueueActions(({ enqueue, event, self, system }) => {
      const ev = event as { type: 'explorer.DIRECTORY_CHANGED'; data: { path: string } }
      enqueue.assign({
        currentDirectory: ev.data.path
      })
      enqueue(() => {
        updateParentState(self, { currentDirectory: ev.data.path })
        
        // Refresh git panels if active
        const parentContext = getParentContext(self)
        if (parentContext?.selectedPanel === 'commit') {
          system.get('commit')?.send({ type: 'commit.REFRESH_STATUS' })
        } else if (parentContext?.selectedPanel === 'pr') {
          system.get('pr')?.send({ type: 'pr.REFRESH_STATUS' })
        }
      })
    }),
    
    handleCodeStartup: ({ event, self }) => {
      // Explorer can handle startup if needed
      // Currently no specific action required
    },
    
    listFiles: ({ event }) => {
      const ev = event as { type: 'explorer.LIST_FILES'; path: string }
      sendToBackend('LIST_FILES', { path: ev.path })
    },
    
    assignFiles: assign({
      files: ({ event }) => {
        const ev = event as { type: 'explorer.FILES_LISTED'; data: { path: string; files: FileInfo[] } }
        return ev.data.files
      },
      isLoading: false,
      error: null
    }),
    
    deleteFile: ({ event }) => {
      const ev = event as { type: 'explorer.DELETE_FILE'; path: string }
      sendToBackend('DELETE_FILE', { path: ev.path })
    },
    
    renameFile: ({ event }) => {
      const ev = event as { type: 'explorer.RENAME_FILE'; oldPath: string; newPath: string }
      sendToBackend('RENAME_FILE', { oldPath: ev.oldPath, newPath: ev.newPath })
    },
    
    assignError: assign({
      error: ({ event }) => {
        const ev = event as { type: 'explorer.ERROR'; message: string }
        return ev.message
      },
      isLoading: false
    }),
    
    initialize: ({ event, self }) => {
      const ev = event as { type: 'explorer.INITIALIZE'; rootDirectory: string }
      // Update local state and notify parent
      self.send({ type: 'explorer.SET_ROOT_DIRECTORY', path: ev.rootDirectory })
      self.send({ type: 'explorer.LIST_FILES', path: ev.rootDirectory })
    },
    
    openFile: ({ event }) => {
      const ev = event as { type: 'explorer.OPEN_FILE'; path: string }
      sendToBackend('READ_FILE', { path: ev.path })
    },
    
    navigateToDirectory: ({ event, self }) => {
      const ev = event as { type: 'explorer.NAVIGATE_TO_DIRECTORY'; path: string }
      sendToBackend('CHANGE_DIRECTORY', { path: ev.path })
      sendToBackend('LIST_FILES', { path: ev.path })
      
      // Update parent state
      updateParentState(self, { currentDirectory: ev.path })
    },
    
    setRootDirectory: ({ event, self }) => {
      const ev = event as { type: 'explorer.SET_ROOT_DIRECTORY'; path: string }
      localStorage.setItem('code-plugin-root-directory', ev.path)
      sendToBackend('CHANGE_DIRECTORY', { path: ev.path })
      sendToBackend('LIST_FILES', { path: ev.path })
      
      // Update parent state
      updateParentState(self, { 
        rootDirectory: ev.path,
        currentDirectory: ev.path
      })
    },
    
    handleFileDeleted: ({ event, self, context }) => {
      const ev = event as { type: 'explorer.FILE_DELETED'; path: string }
      const parentContext = getParentContext(self)
      
      // Refresh file list
      sendToBackend('LIST_FILES', { path: parentContext?.currentDirectory || context.currentDirectory })
      
      // Remove from open files if it's open
      if (parentContext?.openFiles?.find((f: any) => f.path === ev.path)) {
        const newOpenFiles = parentContext.openFiles.filter((f: any) => f.path !== ev.path)
        const newActiveFile = parentContext.activeFilePath === ev.path
          ? (newOpenFiles.length > 0 ? newOpenFiles[0].path : null)
          : parentContext.activeFilePath
          
        updateParentState(self, {
          openFiles: newOpenFiles,
          activeFilePath: newActiveFile
        })
      }
    },
    
    handleFileRenamed: ({ event, self, context }) => {
      const ev = event as { type: 'explorer.FILE_RENAMED'; oldPath: string; newPath: string }
      const parentContext = getParentContext(self)
      
      // Refresh file list
      sendToBackend('LIST_FILES', { path: parentContext?.currentDirectory || context.currentDirectory })
      
      // Update open files if renamed file is open
      const openFiles = parentContext?.openFiles || []
      const hasRenamedFile = openFiles.some((f: any) => f.path === ev.oldPath)
      
      if (hasRenamedFile) {
        const newOpenFiles = openFiles.map((f: any) => 
          f.path === ev.oldPath ? { ...f, path: ev.newPath } : f
        )
        const newActiveFile = parentContext.activeFilePath === ev.oldPath 
          ? ev.newPath 
          : parentContext.activeFilePath
          
        updateParentState(self, {
          openFiles: newOpenFiles,
          activeFilePath: newActiveFile
        })
      }
    }
  }
}).createMachine({
  id: 'explorer',
  initial: 'idle',
  context: {
    files: [],
    isLoading: false,
    error: null,
    rootDirectory: '',
    currentDirectory: ''
  },
  states: {
    idle: {
      on: {
        'explorer.LIST_FILES': {
          actions: ['setLoading', 'listFiles']
        },
        'explorer.FILES_LISTED': {
          actions: 'assignFiles'
        },
        'explorer.DELETE_FILE': {
          actions: 'deleteFile'
        },
        'explorer.RENAME_FILE': {
          actions: 'renameFile'
        },
        'explorer.INITIALIZE': {
          actions: 'initialize'
        },
        'explorer.OPEN_FILE': {
          actions: 'openFile'
        },
        'explorer.NAVIGATE_TO_DIRECTORY': {
          actions: 'navigateToDirectory'
        },
        'explorer.SET_ROOT_DIRECTORY': {
          actions: 'setRootDirectory'
        },
        'explorer.FILE_DELETED': {
          actions: 'handleFileDeleted'
        },
        'explorer.FILE_RENAMED': {
          actions: 'handleFileRenamed'
        },
        'explorer.ERROR': {
          actions: 'assignError'
        },
        // Handle backend events
        'explorer.FILE_CONTENT': {
          actions: 'handleFileContent'
        },
        'explorer.FILE_SAVED': {
          actions: 'handleFileSaved'
        },
        'explorer.FILE_CHANGED_EXTERNALLY': {
          actions: 'handleFileChangedExternally'
        },
        'explorer.CODE_ERROR': {
          actions: 'handleCodeError'
        },
        'explorer.CURRENT_DIRECTORY': {
          actions: 'handleCurrentDirectory'
        },
        'explorer.DIRECTORY_CHANGED': {
          actions: 'handleDirectoryChanged'
        },
        'CODE_STARTUP': {
          actions: 'handleCodeStartup'
        }
      }
    }
  }
});