import { assign, setup } from 'xstate'
import { emit } from '@/core/shared/actor-helpers'
import { rootEvents } from '@/core/router/bus-emitter'
import { FileSystemRepository } from '../services/filesystem'
import { GitWatcherService } from '../services/gitwatcher'
import type { FileChangeInfo } from '../services/gitwatcher'
import { DirectoryContent, FileContent, FileInfo, CodeSystemError, QuickOpenResult } from '../types'

const pluginId = 'code' as const

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
export type IncomingExplorerEvents =
  | { type: 'explorer.LIST_FILES'; path: string }
  | { type: 'explorer.READ_FILE'; path: string }
  | { type: 'explorer.WRITE_FILE'; path: string; content: string }
  | { type: 'explorer.CREATE_FILE'; path: string; content?: string }
  | { type: 'explorer.DELETE_FILE'; path: string }
  | { type: 'explorer.RENAME_FILE'; oldPath: string; newPath: string }
  | { type: 'explorer.CREATE_DIRECTORY'; path: string }
  | { type: 'explorer.GET_FILE_INFO'; path: string }
  | { type: 'explorer.CLOSE_FILE'; path: string }
  | { type: 'explorer.QUICK_OPEN_SEARCH'; baseDirectory: string }
  | { type: 'explorer.MOVE_FILES'; sourcePaths: string[]; targetDir: string }
  | { type: 'explorer.COPY_FILES'; sourcePaths: string[]; targetDir: string }

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
  | { type: 'explorer.FILE_CHANGED_EXTERNALLY'; data: FileChangeInfo }
  | { type: 'explorer.QUICK_OPEN_RESULTS'; data: QuickOpenResult[] }
  | { type: 'explorer.FILES_MOVED'; data: { sourcePaths: string[]; targetDir: string; movedPaths: string[] } }
  | { type: 'explorer.FILES_COPIED'; data: { targetDir: string; copiedPaths: string[] } }

export interface Context {
  baseDirectory: string | null
  repository: FileSystemRepository | null
  gitWatcher: GitWatcherService | null
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
  | { type: 'explorer.SET_BASE_DIRECTORY'; path: string }
  | { type: 'explorer.UPDATE_BASE_DIRECTORY'; path: string; gitWatcher: GitWatcherService | null }
  | { type: 'explorer.CLOSE_FILE'; path: string }
  | { type: 'explorer.MOVE_FILES'; sourcePaths: string[]; targetDir: string }
  | { type: 'explorer.COPY_FILES'; sourcePaths: string[]; targetDir: string }
  | { type: 'explorer.FILE_CHANGE_CALLBACK'; change: FileChangeInfo }
  | { type: 'explorer.QUICK_OPEN_SEARCH'; baseDirectory: string }
  | { type: 'CODE_CONNECTED' };

export const explorerSystem = setup({
  types: {
    context: {} as Context,
    events: {} as Event,
    input: {} as { baseDirectory: string | null; gitWatcher?: GitWatcherService | null }
  },
  actions: {
    setupFileWatcher: ({ context, self }) => {
      // Set up the callback for file changes from git watcher
      if (context.gitWatcher) {
        context.gitWatcher.setFileChangeCallback((change: FileChangeInfo) => {
          self.send({ type: 'explorer.FILE_CHANGE_CALLBACK', change })
        })
      }
    },

    handleFileChange: ({ event }) => {
      const ev = event as { type: 'explorer.FILE_CHANGE_CALLBACK'; change: FileChangeInfo }
      
      const wrapped = emit(pluginId, {
        type: 'explorer.FILE_CHANGED_EXTERNALLY',
        data: ev.change
      })
      rootEvents.emitOutgoing(wrapped.event)
    },

    sendBaseDirectoryInfo: ({ context }) => {
      // Send base directory listing on connect
      if (context.baseDirectory && context.repository) {
        context.repository.listDirectory(context.baseDirectory).then(content => {
          const wrapped = emit(pluginId, {
            type: 'explorer.FILES_LISTED',
            data: content,
          })
          rootEvents.emitOutgoing(wrapped.event)
        }).catch(() => {
          // Ignore errors on connect
        })
      }
    },

    listFiles: async ({ event, context }) => {
      const ev = event as { type: 'explorer.LIST_FILES'; path: string }

      if (!requireRepository(context, ev.path)) return

      try {
        const path = ev.path || context.baseDirectory || ''
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

        // Register file with git watcher for external change detection
        if (context.gitWatcher) {
          context.gitWatcher.registerOpenFile(ev.path)
        }
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


    setBaseDirectory: ({ event, context }) => {
      // No longer need to send active directory info
    },

    assignBaseDirectory: assign({
      baseDirectory: ({ event }) => {
        const ev = event as { type: 'explorer.SET_BASE_DIRECTORY'; path: string }
        return ev.path
      },
      repository: ({ event }) => {
        const ev = event as { type: 'explorer.SET_BASE_DIRECTORY'; path: string }
        return new FileSystemRepository(ev.path)
      },
    }),

    updateBaseDirectory: assign({
      baseDirectory: ({ event }) => {
        const ev = event as { type: 'explorer.UPDATE_BASE_DIRECTORY'; path: string; gitWatcher: GitWatcherService | null }
        return ev.path
      },
      repository: ({ event }) => {
        const ev = event as { type: 'explorer.UPDATE_BASE_DIRECTORY'; path: string; gitWatcher: GitWatcherService | null }
        return new FileSystemRepository(ev.path)
      },
      gitWatcher: ({ event }) => {
        const ev = event as { type: 'explorer.UPDATE_BASE_DIRECTORY'; path: string; gitWatcher: GitWatcherService | null }
        return ev.gitWatcher
      }
    }),


    closeFile: ({ event, context }) => {
      const ev = event as { type: 'explorer.CLOSE_FILE'; path: string }
      // Unregister file from git watcher when closed
      if (context.gitWatcher) {
        context.gitWatcher.unregisterOpenFile(ev.path)
      }
    },

    quickOpenSearch: async ({ event, context }) => {
      const ev = event as { type: 'explorer.QUICK_OPEN_SEARCH'; baseDirectory: string }

      if (!requireRepository(context, ev.baseDirectory)) return
      
      try {
        const files = await context.repository.getAllFiles(ev.baseDirectory)
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
            path: ev.baseDirectory,
          },
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    moveFiles: async ({ event, context }) => {
      const ev = event as { type: 'explorer.MOVE_FILES'; sourcePaths: string[]; targetDir: string }

      if (!requireRepository(context, ev.targetDir)) return

      try {
        const movedPaths: string[] = []
        for (const sourcePath of ev.sourcePaths) {
          const destPath = await context.repository.moveFile(sourcePath, ev.targetDir)
          movedPaths.push(destPath)
          // Unregister old path from watcher to prevent stale FILE_CHANGED_EXTERNALLY events
          if (context.gitWatcher) {
            context.gitWatcher.unregisterOpenFile(sourcePath)
          }
        }

        const wrapped = emit(pluginId, {
          type: 'explorer.FILES_MOVED',
          data: { sourcePaths: ev.sourcePaths, targetDir: ev.targetDir, movedPaths },
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

    copyFiles: async ({ event, context }) => {
      const ev = event as { type: 'explorer.COPY_FILES'; sourcePaths: string[]; targetDir: string }

      if (!requireRepository(context, ev.targetDir)) return

      try {
        const copiedPaths: string[] = []
        for (const sourcePath of ev.sourcePaths) {
          const destPath = await context.repository.copyFileInto(sourcePath, ev.targetDir)
          copiedPaths.push(destPath)
        }

        const wrapped = emit(pluginId, {
          type: 'explorer.FILES_COPIED',
          data: { targetDir: ev.targetDir, copiedPaths },
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

    listBaseFiles: async ({ context }) => {
      if (!requireRepository(context, context.baseDirectory || '')) return

      try {
        const path = context.baseDirectory || ''
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
  context: ({ input }: { input?: { baseDirectory: string | null; gitWatcher?: GitWatcherService | null } }) => {
    const baseDir = input?.baseDirectory || null
    return {
      baseDirectory: baseDir,
      repository: baseDir ? new FileSystemRepository(baseDir) : null,
      gitWatcher: input?.gitWatcher || null,
    }
  },
  entry: 'setupFileWatcher',
  states: {
    idle: {
      on: {
        'CODE_CONNECTED': {
          actions: 'sendBaseDirectoryInfo'
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
        'explorer.SET_BASE_DIRECTORY': {
          actions: ['assignBaseDirectory', 'setBaseDirectory']
        },
        'explorer.MOVE_FILES': {
          actions: 'moveFiles'
        },
        'explorer.COPY_FILES': {
          actions: 'copyFiles'
        },
        'explorer.UPDATE_BASE_DIRECTORY': {
          actions: ['updateBaseDirectory', 'setupFileWatcher', 'listBaseFiles']
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