import { assign, setup } from 'xstate'
import { emit } from '@/core/utils/actor-helpers'
import { rootEvents } from '@/core/router/bus-emitter'
import { systemBus } from '@/core/utils/event-helpers'
import { z } from 'zod'
import { FileSystemRepository } from '../services/filesystem'
import { FileWatcherService } from '../services/filewatcher'
import { DirectoryContent, FileContent, FileInfo, CodeSystemError, FileChangeInfo, QuickOpenResult } from '../types'

const pluginId = 'code' as const
const busEvent = systemBus(pluginId)

function requireRepository(context: Context, path: string): context is Context & { repository: FileSystemRepository } {
  if (!context.repository) {
    const wrapped = emit(pluginId, {
      type: 'explorer.CODE_ERROR',
      data: {
        code: 'INVALID_PATH',
        message: 'No directory selected.',
        path,
      },
    })
    rootEvents.emitOutgoing(wrapped.event)
    return false
  }
  return true
}

// Incoming events from frontend
export const IncomingExplorerEvents = [
  busEvent('explorer.LIST_FILES', { path: z.string() }),
  busEvent('explorer.READ_FILE', { path: z.string() }),
  busEvent('explorer.WRITE_FILE', { path: z.string(), content: z.string() }),
  busEvent('explorer.CREATE_FILE', { path: z.string(), content: z.string().optional() }),
  busEvent('explorer.DELETE_FILE', { path: z.string() }),
  busEvent('explorer.RENAME_FILE', { oldPath: z.string(), newPath: z.string() }),
  busEvent('explorer.CREATE_DIRECTORY', { path: z.string() }),
  busEvent('explorer.GET_FILE_INFO', { path: z.string() }),
  busEvent('explorer.CLOSE_FILE', { path: z.string() }),
  busEvent('explorer.UPDATE_CURRENT_DIRECTORY', { path: z.string() }),
  busEvent('explorer.QUICK_OPEN_SEARCH', { rootDirectory: z.string() }),
] as const

// Outgoing events to frontend
export type OutgoingExplorerEvents =
  | { type: 'explorer.FILES_LISTED'; data: DirectoryContent }
  | { type: 'explorer.FILE_CREATED'; data: { path: string } }
  | { type: 'explorer.FILE_DELETED'; data: { path: string } }
  | { type: 'explorer.FILE_RENAMED'; data: { oldPath: string; newPath: string } }
  | { type: 'explorer.DIRECTORY_CREATED'; data: { path: string } }
  | { type: 'explorer.FILE_INFO'; data: FileInfo }
  | { type: 'explorer.FILE_CONTENT'; data: FileContent }
  | { type: 'explorer.FILE_SAVED'; data: { path: string } }
  | { type: 'explorer.CODE_ERROR'; data: CodeSystemError }
  | { type: 'explorer.CURRENT_DIRECTORY'; data: { path: string; rootDirectory: string } }
  | { type: 'explorer.FILE_CHANGED_EXTERNALLY'; data: FileChangeInfo }
  | { type: 'explorer.QUICK_OPEN_RESULTS'; data: QuickOpenResult[] }

export interface Context {
  currentDirectory: string | null
  rootDirectory: string | null
  repository: FileSystemRepository | null
  fileWatcher: FileWatcherService
}

export type Event =
  | { type: 'explorer.LIST_FILES'; path: string }
  | { type: 'explorer.READ_FILE'; path: string }
  | { type: 'explorer.WRITE_FILE'; path: string; content: string }
  | { type: 'explorer.CREATE_FILE'; path: string; content?: string }
  | { type: 'explorer.DELETE_FILE'; path: string }
  | { type: 'explorer.RENAME_FILE'; oldPath: string; newPath: string }
  | { type: 'explorer.CREATE_DIRECTORY'; path: string }
  | { type: 'explorer.GET_FILE_INFO'; path: string }
  | { type: 'explorer.SET_ROOT_DIRECTORY'; path: string }
  | { type: 'explorer.UPDATE_CURRENT_DIRECTORY'; path: string }
  | { type: 'explorer.CLOSE_FILE'; path: string }
  | { type: 'explorer.FILE_CHANGE_CALLBACK'; change: FileChangeInfo }
  | { type: 'explorer.QUICK_OPEN_SEARCH'; rootDirectory: string }
  | { type: 'CODE_CONNECTED' };

export const explorerSystem = setup({
  types: {
    context: {} as Context,
    events: {} as Event,
    input: {} as { rootDirectory: string | null; currentDirectory: string | null }
  },
  actions: {
    setupFileWatcher: ({ context, self }) => {
      // Set up the callback for file changes
      context.fileWatcher.setChangeCallback((change: FileChangeInfo) => {
        self.send({ type: 'explorer.FILE_CHANGE_CALLBACK', change })
      })
    },

    handleFileChange: ({ event }) => {
      const ev = event as { type: 'explorer.FILE_CHANGE_CALLBACK'; change: FileChangeInfo }
      
      const wrapped = emit(pluginId, {
        type: 'explorer.FILE_CHANGED_EXTERNALLY',
        data: ev.change
      })
      rootEvents.emitOutgoing(wrapped.event)
    },

    sendCurrentDirectory: ({ context }) => {
      const wrapped = emit(pluginId, {
        type: 'explorer.CURRENT_DIRECTORY',
        data: {
          path: context.currentDirectory || '',
          rootDirectory: context.rootDirectory || ''
        },
      })
      rootEvents.emitOutgoing(wrapped.event)
    },

    listFiles: async ({ event, context }) => {
      const ev = event as { type: 'explorer.LIST_FILES'; path: string }
      
      if (!requireRepository(context, ev.path)) return
      
      try {
        const path = ev.path || context.currentDirectory || ''
        const content = await context.repository.listDirectory(path)
        const wrapped = emit(pluginId, {
          type: 'explorer.FILES_LISTED',
          data: content,
        })
        rootEvents.emitOutgoing(wrapped.event)
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'explorer.CODE_ERROR',
          data: {
            code: error.code || 'IO_ERROR',
            message: error.message,
            path: error.path,
          },
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    readFile: async ({ event, context }) => {
      const ev = event as { type: 'explorer.READ_FILE'; path: string }
      
      if (!requireRepository(context, ev.path)) return
      
      try {
        const content = await context.repository.readFile(ev.path)
        const wrapped = emit(pluginId, {
          type: 'explorer.FILE_CONTENT',
          data: content,
        })
        rootEvents.emitOutgoing(wrapped.event)

        // Start watching the file for external changes
        await context.fileWatcher.watchFile(ev.path)
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'explorer.CODE_ERROR',
          data: {
            code: error.code || 'IO_ERROR',
            message: error.message,
            path: error.path,
          },
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    writeFile: async ({ event, context }) => {
      const ev = event as { type: 'explorer.WRITE_FILE'; path: string; content: string }
      
      if (!requireRepository(context, ev.path)) return
      
      try {
        await context.repository.writeFile(ev.path, ev.content)
        const wrapped = emit(pluginId, {
          type: 'explorer.FILE_SAVED',
          data: { path: ev.path },
        })
        rootEvents.emitOutgoing(wrapped.event)
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'explorer.CODE_ERROR',
          data: {
            code: error.code || 'IO_ERROR',
            message: error.message,
            path: error.path,
          },
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    createFile: async ({ event, context }) => {
      const ev = event as { type: 'explorer.CREATE_FILE'; path: string; content?: string }
      
      if (!requireRepository(context, ev.path)) return
      
      try {
        await context.repository.writeFile(ev.path, ev.content || '')
        const wrapped = emit(pluginId, {
          type: 'explorer.FILE_CREATED',
          data: { path: ev.path },
        })
        rootEvents.emitOutgoing(wrapped.event)
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'explorer.CODE_ERROR',
          data: {
            code: error.code || 'IO_ERROR',
            message: error.message,
            path: error.path,
          },
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    deleteFile: async ({ event, context }) => {
      const ev = event as { type: 'explorer.DELETE_FILE'; path: string }
      
      if (!requireRepository(context, ev.path)) return
      
      try {
        await context.repository.deleteFile(ev.path)
        const wrapped = emit(pluginId, {
          type: 'explorer.FILE_DELETED',
          data: { path: ev.path },
        })
        rootEvents.emitOutgoing(wrapped.event)
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'explorer.CODE_ERROR',
          data: {
            code: error.code || 'IO_ERROR',
            message: error.message,
            path: error.path,
          },
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    renameFile: async ({ event, context }) => {
      const ev = event as { type: 'explorer.RENAME_FILE'; oldPath: string; newPath: string }
      
      if (!requireRepository(context, ev.oldPath)) return
      
      try {
        await context.repository.renameFile(ev.oldPath, ev.newPath)
        const wrapped = emit(pluginId, {
          type: 'explorer.FILE_RENAMED',
          data: { oldPath: ev.oldPath, newPath: ev.newPath },
        })
        rootEvents.emitOutgoing(wrapped.event)
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'explorer.CODE_ERROR',
          data: {
            code: error.code || 'IO_ERROR',
            message: error.message,
            path: error.path,
          },
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    createDirectory: async ({ event, context }) => {
      const ev = event as { type: 'explorer.CREATE_DIRECTORY'; path: string }
      
      if (!requireRepository(context, ev.path)) return
      
      try {
        await context.repository.createDirectory(ev.path)
        const wrapped = emit(pluginId, {
          type: 'explorer.DIRECTORY_CREATED',
          data: { path: ev.path },
        })
        rootEvents.emitOutgoing(wrapped.event)
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'explorer.CODE_ERROR',
          data: {
            code: error.code || 'IO_ERROR',
            message: error.message,
            path: error.path,
          },
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    getFileInfo: async ({ event, context }) => {
      const ev = event as { type: 'explorer.GET_FILE_INFO'; path: string }
      
      if (!requireRepository(context, ev.path)) return
      
      try {
        const info = await context.repository.getFileInfo(ev.path)
        const wrapped = emit(pluginId, {
          type: 'explorer.FILE_INFO',
          data: info,
        })
        rootEvents.emitOutgoing(wrapped.event)
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'explorer.CODE_ERROR',
          data: {
            code: error.code || 'IO_ERROR',
            message: error.message,
            path: error.path,
          },
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },


    setRootDirectory: ({ event }) => {
      const ev = event as { type: 'explorer.SET_ROOT_DIRECTORY'; path: string }
      
      // Send current directory info to frontend
      const wrapped = emit(pluginId, {
        type: 'explorer.CURRENT_DIRECTORY',
        data: { path: ev.path, rootDirectory: ev.path },
      })
      rootEvents.emitOutgoing(wrapped.event)
    },

    assignRootDirectory: assign({
      rootDirectory: ({ event }) => {
        const ev = event as { type: 'explorer.SET_ROOT_DIRECTORY'; path: string }
        return ev.path
      },
      currentDirectory: ({ event }) => {
        const ev = event as { type: 'explorer.SET_ROOT_DIRECTORY'; path: string }
        return ev.path
      },
      repository: ({ event }) => {
        const ev = event as { type: 'explorer.SET_ROOT_DIRECTORY'; path: string }
        return new FileSystemRepository(ev.path)
      },
    }),

    updateCurrentDirectory: assign({
      currentDirectory: ({ event }) => {
        const ev = event as { type: 'explorer.UPDATE_CURRENT_DIRECTORY'; path: string }
        return ev.path
      }
    }),


    closeFile: async ({ event, context }) => {
      const ev = event as { type: 'explorer.CLOSE_FILE'; path: string }
      try {
        // Stop watching the file when it's closed
        await context.fileWatcher.unwatchFile(ev.path)
      } catch (error) {
        console.error('Failed to unwatch file:', error)
      }
    },

    quickOpenSearch: async ({ event, context }) => {
      const ev = event as { type: 'explorer.QUICK_OPEN_SEARCH'; rootDirectory: string }
      
      if (!requireRepository(context, ev.rootDirectory)) return
      
      try {
        const files = await context.repository.getAllFiles(ev.rootDirectory)
        const wrapped = emit(pluginId, {
          type: 'explorer.QUICK_OPEN_RESULTS',
          data: files,
        })
        rootEvents.emitOutgoing(wrapped.event)
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'explorer.CODE_ERROR',
          data: {
            code: error.code || 'IO_ERROR',
            message: error.message,
            path: ev.rootDirectory,
          },
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    listRootFiles: async ({ context }) => {
      if (!requireRepository(context, context.rootDirectory || '')) return
      
      try {
        const path = context.rootDirectory || ''
        const content = await context.repository.listDirectory(path)
        const wrapped = emit(pluginId, {
          type: 'explorer.FILES_LISTED',
          data: content,
        })
        rootEvents.emitOutgoing(wrapped.event)
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'explorer.CODE_ERROR',
          data: {
            code: error.code || 'IO_ERROR',
            message: error.message,
            path: error.path,
          },
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },
  }
}).createMachine({
  id: 'explorer',
  initial: 'idle',
  context: ({ input }: { input?: { rootDirectory: string | null; currentDirectory: string | null } }) => {
    const rootDir = input?.rootDirectory || null
    return {
      currentDirectory: input?.currentDirectory || rootDir,
      rootDirectory: rootDir,
      repository: rootDir ? new FileSystemRepository(rootDir) : null,
      fileWatcher: new FileWatcherService(),
    }
  },
  entry: 'setupFileWatcher',
  states: {
    idle: {
      on: {
        'CODE_CONNECTED': {
          actions: 'sendCurrentDirectory'
        },
        'explorer.LIST_FILES': {
          actions: 'listFiles'
        },
        'explorer.READ_FILE': {
          actions: 'readFile'
        },
        'explorer.WRITE_FILE': {
          actions: 'writeFile'
        },
        'explorer.CREATE_FILE': {
          actions: 'createFile'
        },
        'explorer.DELETE_FILE': {
          actions: 'deleteFile'
        },
        'explorer.RENAME_FILE': {
          actions: 'renameFile'
        },
        'explorer.CREATE_DIRECTORY': {
          actions: 'createDirectory'
        },
        'explorer.GET_FILE_INFO': {
          actions: 'getFileInfo'
        },
        'explorer.SET_ROOT_DIRECTORY': {
          actions: ['assignRootDirectory', 'setRootDirectory', 'listRootFiles']
        },
        'explorer.UPDATE_CURRENT_DIRECTORY': {
          actions: 'updateCurrentDirectory'
        },
        'explorer.CLOSE_FILE': {
          actions: 'closeFile'
        },
        'explorer.FILE_CHANGE_CALLBACK': {
          actions: 'handleFileChange'
        },
        'explorer.QUICK_OPEN_SEARCH': {
          actions: 'quickOpenSearch'
        }
      }
    }
  }
})