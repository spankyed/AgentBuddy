import { setup, assign, enqueueActions } from 'xstate';
import { trpc } from '@/core/trpc';
import { updateParentState, getParentContext } from '../../utils/parent-communication';
import { mergeTabs, removeTabs } from '../../utils/tab-management';
import { addRecentFile } from '../../utils/recent-files';

// File types
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

// File watching types
export interface FileChangeInfo {
  path: string
  modifiedAt: Date
  changeType: 'add' | 'change' | 'unlink'
}

const sendToBackend = (type: string, data: any) => {
  trpc.bus.send.mutate({
    systemId: 'code' as any,
    type: type as any,
    ...data
  } as any)
}

export interface Context {
  files: FileInfo[]
}

// Quick open types
export interface QuickOpenResult {
  path: string
  relativePath: string
  name: string
  type: 'file' | 'directory'
  extension?: string
  score?: number
}

export type Event = 
  | { type: 'explorer.INITIALIZE'; rootDirectory: string }
  | { type: 'explorer.LIST_FILES'; path: string }
  | { type: 'explorer.CREATE_FILE'; name: string }
  | { type: 'explorer.DELETE_FILE'; path: string }
  | { type: 'explorer.RENAME_FILE'; oldPath: string; newPath: string }
  | { type: 'explorer.OPEN_FILE'; path: string }
  | { type: 'explorer.OPEN_FILES'; paths: string[] }
  | { type: 'explorer.WRITE_FILE'; path: string; content: string }
  | { type: 'explorer.CLOSE_FILE'; path: string }
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
  // Quick open events
  | { type: 'explorer.QUICK_OPEN_SEARCH'; rootDirectory: string }
  | { type: 'explorer.QUICK_OPEN_RESULTS'; data: QuickOpenResult[] }
  // Broadcast events
  | { type: 'CODE_STARTUP'; data: any };

export const explorerState = setup({
  types: {
    context: {} as Context,
    events: {} as Event
  },
  actions: {
    setLoading: ({ self }) => {
      updateParentState(self, { isLoading: true, error: null })
    },
    
    handleFileContent: ({ event, self }) => {
      const ev = event as { type: 'explorer.FILE_CONTENT'; data: { path: string; content: string; encoding: string } }
      const parentContext = getParentContext(self)
      const openFiles = parentContext?.openFiles || []
      const existingFile = openFiles.find((f: any) => f.path === ev.data.path)
      
      // Track the file as recently opened
      const recentlyOpenedFiles = parentContext?.recentlyOpenedFiles || []
      const updatedRecentFiles = addRecentFile(recentlyOpenedFiles, ev.data.path)
      
      if (existingFile) {
        // Update content for existing file
        const updatedFiles = openFiles.map((f: any) => 
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
        updateParentState(self, {
          openFiles: updatedFiles,
          activeFilePath: ev.data.path,
          isLoading: false,
          recentlyOpenedFiles: updatedRecentFiles
        })
      } else {
        // Add new file
        const newTab = {
          path: ev.data.path,
          content: ev.data.content,
          modified: false
        }
        const result = mergeTabs(
          openFiles,
          [newTab],
          ev.data.path // Set as active
        )
        updateParentState(self, {
          ...result,
          isLoading: false,
          recentlyOpenedFiles: updatedRecentFiles
        })
      }
    },
    
    handleFileSaved: ({ event, self }) => {
      const ev = event as { type: 'explorer.FILE_SAVED'; data: { path: string } }
      const parentContext = getParentContext(self)
      
      const updatedFiles = (parentContext?.openFiles || []).map((f: any) => 
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
      
      updateParentState(self, { openFiles: updatedFiles })
    },
    
    handleFileChangedExternally: ({ event, self }) => {
      const ev = event as { type: 'explorer.FILE_CHANGED_EXTERNALLY'; data: { path: string; modifiedAt: Date; changeType: 'add' | 'change' | 'unlink' } }
      const parentContext = getParentContext(self)
      const openFiles = parentContext?.openFiles || []
      const file = openFiles.find((f: any) => f.path === ev.data.path)
      
      if (file && !file.isDiff) {
        const updatedFiles = openFiles.map((f: any) => {
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
        
        updateParentState(self, { openFiles: updatedFiles })
        
        // Only refresh if file is not modified by user
        if (!file.modified) {
          sendToBackend('explorer.READ_FILE', { path: ev.data.path })
        }
      }
    },
    
    handleCodeError: ({ event, self }) => {
      const ev = event as { type: 'explorer.CODE_ERROR'; data: { message: string } }
      updateParentState(self, { error: ev.data.message, isLoading: false })
    },
    
    handleCurrentDirectory: ({ event, self }) => {
      const ev = event as { type: 'explorer.CURRENT_DIRECTORY'; data: { path: string; rootDirectory: string } }
      updateParentState(self, { currentDirectory: ev.data.path })
    },
    
    handleDirectoryChanged: ({ event, self, system }) => {
      const ev = event as { type: 'explorer.DIRECTORY_CHANGED'; data: { path: string } }
      updateParentState(self, { currentDirectory: ev.data.path })
      
      // Refresh git panels if active
      const parentContext = getParentContext(self)
      if (parentContext?.selectedPanel === 'commit') {
        system.get('commit')?.send({ type: 'commit.REFRESH_STATUS' })
      } else if (parentContext?.selectedPanel === 'pr') {
        system.get('pr')?.send({ type: 'pr.REFRESH_STATUS' })
      }
    },
    
    handleCodeStartup: ({ event, self }) => {
      // Explorer can handle startup if needed
      // Currently no specific action required
    },
    
    listFiles: ({ event }) => {
      const ev = event as { type: 'explorer.LIST_FILES'; path: string }
      sendToBackend('explorer.LIST_FILES', { path: ev.path })
    },
    
    assignFiles: assign(({ event, self }) => {
      const ev = event as { type: 'explorer.FILES_LISTED'; data: { path: string; files: FileInfo[] } }
      updateParentState(self, { isLoading: false, error: null })
      return {
        files: ev.data.files
      }
    }),
    
    deleteFile: ({ event }) => {
      const ev = event as { type: 'explorer.DELETE_FILE'; path: string }
      sendToBackend('explorer.DELETE_FILE', { path: ev.path })
    },
    
    renameFile: ({ event }) => {
      const ev = event as { type: 'explorer.RENAME_FILE'; oldPath: string; newPath: string }
      sendToBackend('explorer.RENAME_FILE', { oldPath: ev.oldPath, newPath: ev.newPath })
    },
    
    assignError: ({ event, self }) => {
      const ev = event as { type: 'explorer.ERROR'; message: string }
      updateParentState(self, { error: ev.message, isLoading: false })
    },
    
    initialize: ({ event, self }) => {
      const ev = event as { type: 'explorer.INITIALIZE'; rootDirectory: string }
      // Update local state and notify parent
      self.send({ type: 'explorer.SET_ROOT_DIRECTORY', path: ev.rootDirectory })
    },
    
    openFile: ({ event }) => {
      const ev = event as { type: 'explorer.OPEN_FILE'; path: string }
      sendToBackend('explorer.READ_FILE', { path: ev.path })
    },
    
    openFiles: enqueueActions(({ enqueue, event }) => {
      const ev = event as { type: 'explorer.OPEN_FILES'; paths: string[] }
      ev.paths.forEach(path => {
        enqueue(({ self }) => {
          self.send({ type: 'explorer.OPEN_FILE', path })
        })
      })
    }),
    
    navigateToDirectory: ({ event, self }) => {
      const ev = event as { type: 'explorer.NAVIGATE_TO_DIRECTORY'; path: string }
      sendToBackend('explorer.CHANGE_DIRECTORY', { path: ev.path })
      sendToBackend('explorer.LIST_FILES', { path: ev.path })
      
      // Update parent state
      updateParentState(self, { currentDirectory: ev.path })
    },
    
    setRootDirectory: ({ event, self }) => {
      const ev = event as { type: 'explorer.SET_ROOT_DIRECTORY'; path: string }
      localStorage.setItem('code-plugin-root-directory', ev.path)
      sendToBackend('explorer.CHANGE_DIRECTORY', { path: ev.path })
      sendToBackend('explorer.LIST_FILES', { path: ev.path })
      
      // Update parent state
      updateParentState(self, { 
        rootDirectory: ev.path,
        currentDirectory: ev.path
      })
    },
    
    handleFileDeleted: ({ event, self }) => {
      const ev = event as { type: 'explorer.FILE_DELETED'; path: string }
      const parentContext = getParentContext(self)
      
      // Refresh file list
      sendToBackend('explorer.LIST_FILES', { path: parentContext?.currentDirectory || '' })
      
      // Remove from open files if it's open
      if (parentContext?.openFiles?.find((f: any) => f.path === ev.path)) {
        const result = removeTabs(
          parentContext.openFiles,
          ev.path,
          parentContext.activeFilePath
        )
        
        updateParentState(self, result)
      }
    },
    
    handleFileRenamed: ({ event, self }) => {
      const ev = event as { type: 'explorer.FILE_RENAMED'; oldPath: string; newPath: string }
      const parentContext = getParentContext(self)
      
      // Refresh file list
      sendToBackend('explorer.LIST_FILES', { path: parentContext?.currentDirectory || '' })
      
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
    },
    
    writeFile: ({ event }) => {
      const ev = event as { type: 'explorer.WRITE_FILE'; path: string; content: string }
      sendToBackend('explorer.WRITE_FILE', { path: ev.path, content: ev.content })
    },
    
    closeFile: ({ event }) => {
      const ev = event as { type: 'explorer.CLOSE_FILE'; path: string }
      sendToBackend('explorer.CLOSE_FILE', { path: ev.path })
    },
    
    quickOpenSearch: ({ event }) => {
      const ev = event as { type: 'explorer.QUICK_OPEN_SEARCH'; rootDirectory: string }
      sendToBackend('explorer.QUICK_OPEN_SEARCH', { rootDirectory: ev.rootDirectory })
    },
    
    handleQuickOpenResults: ({ event, self }) => {
      const ev = event as { type: 'explorer.QUICK_OPEN_RESULTS'; data: QuickOpenResult[] }
      updateParentState(self, { 
        quickOpenResults: ev.data,
        quickOpenLoading: false
      })
    }
  }
}).createMachine({
  id: 'explorer',
  initial: 'idle',
  context: {
    files: []
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
        'explorer.OPEN_FILES': {
          actions: 'openFiles'
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
        'explorer.WRITE_FILE': {
          actions: 'writeFile'
        },
        'explorer.CLOSE_FILE': {
          actions: 'closeFile'
        },
        'explorer.QUICK_OPEN_SEARCH': {
          actions: 'quickOpenSearch'
        },
        'explorer.QUICK_OPEN_RESULTS': {
          actions: 'handleQuickOpenResults'
        },
        'CODE_STARTUP': {
          actions: 'handleCodeStartup'
        }
      }
    }
  }
});