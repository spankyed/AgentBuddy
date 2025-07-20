import { assign, setup } from 'xstate'
import { systemBus, fromSystem } from '@/core/utils/event-helpers'
import { z } from 'zod'
import { FileSystemRepository } from './repository/filesystem'
import { GitRepository } from './repository/git'
import { DirectoryContent, FileContent, FileInfo, CodeSystemError, SearchOptions, SearchResult, SearchProgress, GitStatusFile, GitDiff } from './types'
import { emit, safeEvents } from '@/core/utils/actor-helpers'
import { bus, SystemEvents } from '@/systems/backend'
import type { MergeReceivable } from '@/core/utils/event-helpers'

export const id = 'code' as const

const busEvent = systemBus(id)

const IncomingCodeEvents = [
  busEvent('LIST_FILES', { path: z.string() }),
  busEvent('READ_FILE', { path: z.string() }),
  busEvent('WRITE_FILE', { path: z.string(), content: z.string() }),
  busEvent('CREATE_FILE', { path: z.string(), content: z.string().optional() }),
  busEvent('DELETE_FILE', { path: z.string() }),
  busEvent('RENAME_FILE', { oldPath: z.string(), newPath: z.string() }),
  busEvent('CREATE_DIRECTORY', { path: z.string() }),
  busEvent('GET_FILE_INFO', { path: z.string() }),
  busEvent('CHANGE_DIRECTORY', { path: z.string() }),
  busEvent('SET_ROOT_DIRECTORY', { path: z.string() }),
  busEvent('SEARCH_FILES', { 
    query: z.string(),
    path: z.string(),
    includePattern: z.string().optional(),
    excludePattern: z.string().optional(),
    caseSensitive: z.boolean().optional(),
    wholeWord: z.boolean().optional(),
    useRegex: z.boolean().optional(),
    maxResults: z.number().optional()
  }),
  busEvent('CANCEL_SEARCH', {}),
  busEvent('GET_GIT_STATUS', {}),
  busEvent('GET_GIT_DIFF', { path: z.string().optional(), staged: z.boolean().optional() }),
  busEvent('STAGE_FILES', { paths: z.array(z.string()) }),
  busEvent('UNSTAGE_FILES', { paths: z.array(z.string()) }),
  busEvent('COMMIT', { message: z.string() }),
  busEvent('GET_CURRENT_BRANCH', {}),
] as const

export type OutgoingCodeEvents =
  | { type: 'FILES_LISTED'; data: DirectoryContent }
  | { type: 'FILE_CONTENT'; data: FileContent }
  | { type: 'FILE_SAVED'; data: { path: string } }
  | { type: 'FILE_CREATED'; data: { path: string } }
  | { type: 'FILE_DELETED'; data: { path: string } }
  | { type: 'FILE_RENAMED'; data: { oldPath: string; newPath: string } }
  | { type: 'DIRECTORY_CREATED'; data: { path: string } }
  | { type: 'FILE_INFO'; data: FileInfo }
  | { type: 'DIRECTORY_CHANGED'; data: { path: string } }
  | { type: 'CODE_ERROR'; data: CodeSystemError }
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

export const incomingSystemEvents = fromSystem(IncomingCodeEvents)<OutgoingCodeEvents, typeof id>()

type CodeInternalEvents = SystemEvents 
  | { type: 'ASSIGN_DIRECTORY'; path: string }
  | { type: 'ASSIGN_ROOT_DIRECTORY'; path: string }
  | { type: 'ASSIGN_SEARCH_CONTROLLER'; controller: AbortController }
  | { type: 'CLEAR_SEARCH_CONTROLLER' }
type ReceivableEvents = MergeReceivable<typeof IncomingCodeEvents, CodeInternalEvents>

export interface Context {
  currentDirectory: string
  rootDirectory: string
  repository: FileSystemRepository
  gitRepository: GitRepository
  activeSearchController?: AbortController
}

const typeOf = safeEvents<ReceivableEvents>()

export const systemMachine = setup({
  types: {
    context: {} as Context,
    events: {} as ReceivableEvents,
  },
  actions: {
    sendCurrentDirectory: ({ system, event, self }) => {
      const pluginId = id
      const context = self.getSnapshot().context
      system.get(bus).send(emit(pluginId, {
        type: 'CURRENT_DIRECTORY',
        data: { path: context.currentDirectory },
      }))
    },
    
    listFiles: async ({ system, event, self }) => {
      const ev = typeOf('LIST_FILES', event)
      const pluginId = id
      const context = self.getSnapshot().context
      try {
        const path = ev.path || context.currentDirectory
        const content = await context.repository.listDirectory(path)
        system.get(bus).send(emit(pluginId, {
          type: 'FILES_LISTED',
          data: content,
        }))
      } catch (error: any) {
        system.get(bus).send(emit(pluginId, {
          type: 'CODE_ERROR',
          data: {
            code: error.code || 'IO_ERROR',
            message: error.message,
            path: error.path,
          },
        }))
      }
    },
    
    readFile: async ({ system, event, self }) => {
      const ev = typeOf('READ_FILE', event)
      const pluginId = id
      const context = self.getSnapshot().context
      try {
        const content = await context.repository.readFile(ev.path)
        system.get(bus).send(emit(pluginId, {
          type: 'FILE_CONTENT',
          data: content,
        }))
      } catch (error: any) {
        system.get(bus).send(emit(pluginId, {
          type: 'CODE_ERROR',
          data: {
            code: error.code || 'IO_ERROR',
            message: error.message,
            path: error.path,
          },
        }))
      }
    },
    
    writeFile: async ({ system, event, self }) => {
      const ev = typeOf('WRITE_FILE', event)
      const pluginId = id
      const context = self.getSnapshot().context
      try {
        await context.repository.writeFile(ev.path, ev.content)
        system.get(bus).send(emit(pluginId, {
          type: 'FILE_SAVED',
          data: { path: ev.path },
        }))
      } catch (error: any) {
        system.get(bus).send(emit(pluginId, {
          type: 'CODE_ERROR',
          data: {
            code: error.code || 'IO_ERROR',
            message: error.message,
            path: error.path,
          },
        }))
      }
    },
    
    createFile: async ({ system, event, self }) => {
      const ev = typeOf('CREATE_FILE', event)
      const pluginId = id
      const context = self.getSnapshot().context
      try {
        await context.repository.writeFile(ev.path, ev.content || '')
        system.get(bus).send(emit(pluginId, {
          type: 'FILE_CREATED',
          data: { path: ev.path },
        }))
      } catch (error: any) {
        system.get(bus).send(emit(pluginId, {
          type: 'CODE_ERROR',
          data: {
            code: error.code || 'IO_ERROR',
            message: error.message,
            path: error.path,
          },
        }))
      }
    },
    
    deleteFile: async ({ system, event, self }) => {
      const ev = typeOf('DELETE_FILE', event)
      const pluginId = id
      const context = self.getSnapshot().context
      try {
        await context.repository.deleteFile(ev.path)
        system.get(bus).send(emit(pluginId, {
          type: 'FILE_DELETED',
          data: { path: ev.path },
        }))
      } catch (error: any) {
        system.get(bus).send(emit(pluginId, {
          type: 'CODE_ERROR',
          data: {
            code: error.code || 'IO_ERROR',
            message: error.message,
            path: error.path,
          },
        }))
      }
    },
    
    renameFile: async ({ system, event, self }) => {
      const ev = typeOf('RENAME_FILE', event)
      const pluginId = id
      const context = self.getSnapshot().context
      try {
        await context.repository.renameFile(ev.oldPath, ev.newPath)
        system.get(bus).send(emit(pluginId, {
          type: 'FILE_RENAMED',
          data: { oldPath: ev.oldPath, newPath: ev.newPath },
        }))
      } catch (error: any) {
        system.get(bus).send(emit(pluginId, {
          type: 'CODE_ERROR',
          data: {
            code: error.code || 'IO_ERROR',
            message: error.message,
            path: error.path,
          },
        }))
      }
    },
    
    createDirectory: async ({ system, event, self }) => {
      const ev = typeOf('CREATE_DIRECTORY', event)
      const pluginId = id
      const context = self.getSnapshot().context
      try {
        await context.repository.createDirectory(ev.path)
        system.get(bus).send(emit(pluginId, {
          type: 'DIRECTORY_CREATED',
          data: { path: ev.path },
        }))
      } catch (error: any) {
        system.get(bus).send(emit(pluginId, {
          type: 'CODE_ERROR',
          data: {
            code: error.code || 'IO_ERROR',
            message: error.message,
            path: error.path,
          },
        }))
      }
    },
    
    getFileInfo: async ({ system, event, self }) => {
      const ev = typeOf('GET_FILE_INFO', event)
      const pluginId = id
      const context = self.getSnapshot().context
      try {
        const info = await context.repository.getFileInfo(ev.path)
        system.get(bus).send(emit(pluginId, {
          type: 'FILE_INFO',
          data: info,
        }))
      } catch (error: any) {
        system.get(bus).send(emit(pluginId, {
          type: 'CODE_ERROR',
          data: {
            code: error.code || 'IO_ERROR',
            message: error.message,
            path: error.path,
          },
        }))
      }
    },
    
    changeDirectory: ({ system, event, self }) => {
      const ev = typeOf('CHANGE_DIRECTORY', event)
      const pluginId = id
      // Update the context
      self.send({ type: 'ASSIGN_DIRECTORY', path: ev.path })
      // Send event to frontend
      system.get(bus).send(emit(pluginId, {
        type: 'DIRECTORY_CHANGED',
        data: { path: ev.path },
      }))
    },
    assignDirectory: assign({
      currentDirectory: ({ event }) => {
        const ev = event as { type: 'ASSIGN_DIRECTORY'; path: string }
        return ev.path
      },
    }),
    setRootDirectory: ({ system, event, self }) => {
      const ev = typeOf('SET_ROOT_DIRECTORY', event)
      const pluginId = id
      // Update both current and root directory
      self.send({ type: 'ASSIGN_ROOT_DIRECTORY', path: ev.path })
      // Send event to frontend
      system.get(bus).send(emit(pluginId, {
        type: 'DIRECTORY_CHANGED',
        data: { path: ev.path },
      }))
    },
    assignRootDirectory: assign({
      rootDirectory: ({ event }) => {
        const ev = event as { type: 'ASSIGN_ROOT_DIRECTORY'; path: string }
        return ev.path
      },
      currentDirectory: ({ event }) => {
        const ev = event as { type: 'ASSIGN_ROOT_DIRECTORY'; path: string }
        return ev.path
      },
      gitRepository: ({ event }) => {
        const ev = event as { type: 'ASSIGN_ROOT_DIRECTORY'; path: string }
        return new GitRepository(ev.path)
      }
    }),
    searchFiles: async ({ system, event, self }) => {
      const ev = typeOf('SEARCH_FILES', event)
      const pluginId = id
      const context = self.getSnapshot().context
      
      // Cancel any existing search
      if (context.activeSearchController) {
        context.activeSearchController.abort()
      }
      
      // Create new abort controller
      const controller = new AbortController()
      self.send({ type: 'ASSIGN_SEARCH_CONTROLLER', controller })
      
      try {
        const searchOptions: SearchOptions = {
          query: ev.query,
          path: ev.path || context.currentDirectory,
          includePattern: ev.includePattern,
          excludePattern: ev.excludePattern,
          caseSensitive: ev.caseSensitive,
          wholeWord: ev.wholeWord,
          useRegex: ev.useRegex,
          maxResults: ev.maxResults
        }
        
        let totalMatches = 0
        
        const results = await context.repository.searchFiles(
          searchOptions,
          // Progress callback
          (filesSearched, totalFiles, currentFile) => {
            if (!controller.signal.aborted) {
              system.get(bus).send(emit(pluginId, {
                type: 'SEARCH_PROGRESS',
                data: { filesSearched, totalFiles, currentFile }
              }))
            }
          },
          // Result callback (incremental results)
          (result) => {
            if (!controller.signal.aborted) {
              totalMatches += result.matches.length
              system.get(bus).send(emit(pluginId, {
                type: 'SEARCH_RESULT',
                data: result
              }))
            }
          }
        )
        
        if (!controller.signal.aborted) {
          system.get(bus).send(emit(pluginId, {
            type: 'SEARCH_COMPLETE',
            data: { results, totalMatches }
          }))
        }
      } catch (error: any) {
        if (!controller.signal.aborted) {
          system.get(bus).send(emit(pluginId, {
            type: 'SEARCH_ERROR',
            data: { message: error.message }
          }))
        }
      } finally {
        self.send({ type: 'CLEAR_SEARCH_CONTROLLER' })
      }
    },
    cancelSearch: ({ self }) => {
      const context = self.getSnapshot().context
      if (context.activeSearchController) {
        context.activeSearchController.abort()
      }
    },
    assignSearchController: assign({
      activeSearchController: ({ event }) => {
        const ev = event as { type: 'ASSIGN_SEARCH_CONTROLLER'; controller: AbortController }
        return ev.controller
      }
    }),
    clearSearchController: assign({
      activeSearchController: undefined
    }),
    
    getGitStatus: async ({ system, self }) => {
      const pluginId = id
      const context = self.getSnapshot().context
      try {
        const [status, branch] = await Promise.all([
          context.gitRepository.getStatus(),
          context.gitRepository.getCurrentBranch()
        ])
        system.get(bus).send(emit(pluginId, {
          type: 'GIT_STATUS',
          data: { files: status, branch }
        }))
      } catch (error: any) {
        system.get(bus).send(emit(pluginId, {
          type: 'GIT_ERROR',
          data: { message: error.message }
        }))
      }
    },
    
    getGitDiff: async ({ system, event, self }) => {
      const ev = typeOf('GET_GIT_DIFF', event)
      const pluginId = id
      const context = self.getSnapshot().context
      try {
        const diff = await context.gitRepository.getDiff(ev.path, ev.staged || false)
        system.get(bus).send(emit(pluginId, {
          type: 'GIT_DIFF',
          data: { path: ev.path || 'all', diff, staged: ev.staged || false }
        }))
      } catch (error: any) {
        system.get(bus).send(emit(pluginId, {
          type: 'GIT_ERROR',
          data: { message: error.message }
        }))
      }
    },
    
    stageFiles: async ({ system, event, self }) => {
      const ev = typeOf('STAGE_FILES', event)
      const pluginId = id
      const context = self.getSnapshot().context
      try {
        await context.gitRepository.stageFiles(ev.paths)
        system.get(bus).send(emit(pluginId, {
          type: 'FILES_STAGED',
          data: { paths: ev.paths }
        }))
        // Also send updated status
        self.send({ type: 'GET_GIT_STATUS' })
      } catch (error: any) {
        system.get(bus).send(emit(pluginId, {
          type: 'GIT_ERROR',
          data: { message: error.message }
        }))
      }
    },
    
    unstageFiles: async ({ system, event, self }) => {
      const ev = typeOf('UNSTAGE_FILES', event)
      const pluginId = id
      const context = self.getSnapshot().context
      try {
        await context.gitRepository.unstageFiles(ev.paths)
        system.get(bus).send(emit(pluginId, {
          type: 'FILES_UNSTAGED',
          data: { paths: ev.paths }
        }))
        // Also send updated status
        self.send({ type: 'GET_GIT_STATUS' })
      } catch (error: any) {
        system.get(bus).send(emit(pluginId, {
          type: 'GIT_ERROR',
          data: { message: error.message }
        }))
      }
    },
    
    commit: async ({ system, event, self }) => {
      const ev = typeOf('COMMIT', event)
      const pluginId = id
      const context = self.getSnapshot().context
      try {
        await context.gitRepository.commit(ev.message)
        system.get(bus).send(emit(pluginId, {
          type: 'COMMIT_SUCCESS',
          data: { message: ev.message }
        }))
        // Also send updated status
        self.send({ type: 'GET_GIT_STATUS' })
      } catch (error: any) {
        system.get(bus).send(emit(pluginId, {
          type: 'GIT_ERROR',
          data: { message: error.message }
        }))
      }
    },
    
    getCurrentBranch: async ({ system, self }) => {
      const pluginId = id
      const context = self.getSnapshot().context
      try {
        const branch = await context.gitRepository.getCurrentBranch()
        system.get(bus).send(emit(pluginId, {
          type: 'CURRENT_BRANCH',
          data: { branch }
        }))
      } catch (error: any) {
        system.get(bus).send(emit(pluginId, {
          type: 'GIT_ERROR',
          data: { message: error.message }
        }))
      }
    }
  },
}).createMachine({
  id,
  initial: 'idle',
  context: {
    currentDirectory: process.cwd(),
    rootDirectory: process.cwd(),
    repository: new FileSystemRepository(),
    gitRepository: new GitRepository(process.cwd()),
  },
  states: {
    idle: {
      on: {
        CLIENT_CONNECTED: {
          actions: ['sendCurrentDirectory'],
        },
        LIST_FILES: {
          actions: ['listFiles'],
        },
        READ_FILE: {
          actions: ['readFile'],
        },
        WRITE_FILE: {
          actions: ['writeFile'],
        },
        CREATE_FILE: {
          actions: ['createFile'],
        },
        DELETE_FILE: {
          actions: ['deleteFile'],
        },
        RENAME_FILE: {
          actions: ['renameFile'],
        },
        CREATE_DIRECTORY: {
          actions: ['createDirectory'],
        },
        GET_FILE_INFO: {
          actions: ['getFileInfo'],
        },
        CHANGE_DIRECTORY: {
          actions: ['changeDirectory'],
        },
        ASSIGN_DIRECTORY: {
          actions: ['assignDirectory'],
        },
        SET_ROOT_DIRECTORY: {
          actions: ['setRootDirectory'],
        },
        ASSIGN_ROOT_DIRECTORY: {
          actions: ['assignRootDirectory'],
        },
        SEARCH_FILES: {
          actions: ['searchFiles'],
        },
        CANCEL_SEARCH: {
          actions: ['cancelSearch'],
        },
        ASSIGN_SEARCH_CONTROLLER: {
          actions: ['assignSearchController'],
        },
        CLEAR_SEARCH_CONTROLLER: {
          actions: ['clearSearchController'],
        },
        GET_GIT_STATUS: {
          actions: ['getGitStatus'],
        },
        GET_GIT_DIFF: {
          actions: ['getGitDiff'],
        },
        STAGE_FILES: {
          actions: ['stageFiles'],
        },
        UNSTAGE_FILES: {
          actions: ['unstageFiles'],
        },
        COMMIT: {
          actions: ['commit'],
        },
        GET_CURRENT_BRANCH: {
          actions: ['getCurrentBranch'],
        },
      },
    },
  },
})