import { assign, setup } from 'xstate'
import { systemBus, fromSystem } from '@/core/utils/event-helpers'
import { z } from 'zod'
import { FileSystemRepository } from './services/filesystem'
import { GitRepository } from './services/git'
import { FileWatcherService } from './services/filewatcher'
import { GitWatcherService } from './services/gitwatcher'
import { terminalService } from './services/terminal'
import { terminalCommands } from './repository'
import { DirectoryContent, FileContent, FileInfo, CodeSystemError, SearchOptions, SearchResult, SearchProgress, GitStatusFile, GitDiff, FileChangeInfo, TerminalInfo } from './types'
import { emit, safeEvents } from '@/core/utils/actor-helpers'
import { bus, SystemEvents } from '@/systems/backend'
import type { MergeReceivable } from '@/core/utils/event-helpers'
import { EARS } from '@/core/types'

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
  busEvent('CLOSE_FILE', { path: z.string() }),
  busEvent('GET_BASE_BRANCH', {}),
  busEvent('GET_BRANCH_DIFF', { baseBranch: z.string().optional() }),
  busEvent('GET_BRANCH_FILE_DIFF', { path: z.string(), baseBranch: z.string() }),
  busEvent('REVERT_FILE', { path: z.string() }),
  // Terminal events
  busEvent('CREATE_TERMINAL', {
    title: z.string().optional(),
    cwd: z.string().optional(),
    shell: z.string().optional(),
    cols: z.number().optional(),
    rows: z.number().optional()
  }),
  busEvent('CLOSE_TERMINAL', { terminalId: z.string() }),
  busEvent('TERMINAL_INPUT', { terminalId: z.string(), data: z.string() }),
  busEvent('RESIZE_TERMINAL', { terminalId: z.string(), cols: z.number(), rows: z.number() }),
  busEvent('LIST_TERMINALS', {}),
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
  | { type: 'CURRENT_DIRECTORY'; data: { path: string; rootDirectory: string } }
  | { type: 'SEARCH_RESULT'; data: SearchResult }
  | { type: 'SEARCH_PROGRESS'; data: SearchProgress }
  | { type: 'SEARCH_COMPLETE'; data: { results: SearchResult[]; totalMatches: number } }
  | { type: 'SEARCH_ERROR'; data: { message: string } }
  | { type: 'GIT_STATUS'; data: { files: GitStatusFile[]; branch: string } }
  | { type: 'GIT_DIFF'; data: GitDiff }
  | { type: 'FILES_STAGED'; data: { paths: string[] } }
  | { type: 'FILES_UNSTAGED'; data: { paths: string[] } }
  | { type: 'COMMIT_SUCCESS'; data: { message: string } }
  | { type: 'FILE_REVERTED'; data: { path: string } }
  | { type: 'GIT_ERROR'; data: { message: string } }
  | { type: 'CURRENT_BRANCH'; data: { branch: string } }
  | { type: 'FILE_CHANGED_EXTERNALLY'; data: FileChangeInfo }
  | { type: 'GIT_STATUS_CHANGED'; data: { timestamp: Date } }
  | { type: 'BASE_BRANCH'; data: { branch: string } }
  | { type: 'BRANCH_DIFF'; data: { files: GitStatusFile[]; baseBranch: string } }
  | { type: 'BRANCH_FILE_DIFF'; data: GitDiff }
  // Terminal events
  | { type: 'TERMINAL_CREATED'; data: TerminalInfo }
  | { type: 'TERMINAL_OUTPUT'; data: { terminalId: string; data: string } }
  | { type: 'TERMINAL_INITIAL_OUTPUT'; data: { terminalId: string; data: string } }
  | { type: 'TERMINAL_CLOSED'; data: { terminalId: string } }
  | { type: 'TERMINAL_ERROR'; data: { message: string; terminalId?: string } }
  | { type: 'TERMINALS_LIST'; data: TerminalInfo[] }
  | { type: 'CODE_STARTUP'; data: { terminals: TerminalInfo[] } }

export const incomingSystemEvents = fromSystem(IncomingCodeEvents)<OutgoingCodeEvents, typeof id>()

type CodeInternalEvents = SystemEvents
  | { type: 'ASSIGN_DIRECTORY'; path: string }
  | { type: 'ASSIGN_ROOT_DIRECTORY'; path: string }
  | { type: 'ASSIGN_SEARCH_CONTROLLER'; controller: AbortController }
  | { type: 'CLEAR_SEARCH_CONTROLLER' }
  | { type: 'RESTART_GIT_WATCHER' }
type ReceivableEvents = MergeReceivable<typeof IncomingCodeEvents, CodeInternalEvents>

export interface Context {
  currentDirectory: string
  rootDirectory: string
  repository: FileSystemRepository
  gitRepository: GitRepository
  fileWatcher: FileWatcherService
  gitWatcher: GitWatcherService
  activeSearchController?: AbortController
}

const typeOf = safeEvents<ReceivableEvents>()

export const systemMachine = setup({
  types: {
    context: {} as Context,
    events: {} as ReceivableEvents,
  },
  actions: {
    sendCurrentDirectory: ({ system, event, context }) => {
      const pluginId = id
      system.get(bus).send(emit(pluginId, {
        type: 'CURRENT_DIRECTORY',
        data: {
          path: context.currentDirectory,
          rootDirectory: context.rootDirectory
        },
      }))
    },

    sendStartupData: ({ system }) => {
      const pluginId = id
      
      // Send terminal list and trigger tab restoration
      const terminals = terminalService.list()
      
      system.get(bus).send(emit(pluginId, {
        type: 'CODE_STARTUP',
        data: { terminals }
      }))
    },

    listFiles: async ({ system, event, context }) => {
      const ev = typeOf('LIST_FILES', event)
      const pluginId = id
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

    readFile: async ({ system, event, context }) => {
      const ev = typeOf('READ_FILE', event)
      const pluginId = id
      try {
        const content = await context.repository.readFile(ev.path)
        system.get(bus).send(emit(pluginId, {
          type: 'FILE_CONTENT',
          data: content,
        }))

        // Start watching the file for external changes
        await context.fileWatcher.watchFile(ev.path)
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

    writeFile: async ({ system, event, context }) => {
      const ev = typeOf('WRITE_FILE', event)
      const pluginId = id
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

    createFile: async ({ system, event, context }) => {
      const ev = typeOf('CREATE_FILE', event)
      const pluginId = id
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

    deleteFile: async ({ system, event, context }) => {
      const ev = typeOf('DELETE_FILE', event)
      const pluginId = id
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

    renameFile: async ({ system, event, context }) => {
      const ev = typeOf('RENAME_FILE', event)
      const pluginId = id
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

    createDirectory: async ({ system, event, context }) => {
      const ev = typeOf('CREATE_DIRECTORY', event)
      const pluginId = id
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

    getFileInfo: async ({ system, event, context }) => {
      const ev = typeOf('GET_FILE_INFO', event)
      const pluginId = id
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
      // Restart git watcher with new directory
      self.send({ type: 'RESTART_GIT_WATCHER' })
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
      gitRepository: ({ event, context }) => {
        const ev = event as { type: 'ASSIGN_ROOT_DIRECTORY'; path: string }
        // Clear the old repository's cache before creating new one
        if (context.gitRepository) {
          context.gitRepository.clearCache()
        }
        // Use the new root directory path for git operations
        return new GitRepository(ev.path)
      },
      gitWatcher: ({ event, context }) => {
        const ev = event as { type: 'ASSIGN_ROOT_DIRECTORY'; path: string }
        // Stop the old watcher before creating new one
        if (context.gitWatcher) {
          context.gitWatcher.stopWatching()
        }
        // Create new watcher for the new directory
        return new GitWatcherService(ev.path)
      }
    }),
    searchFiles: async ({ system, event, context, self }) => {
      const ev = typeOf('SEARCH_FILES', event)
      const pluginId = id

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
    cancelSearch: ({ context }) => {
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

    getGitStatus: async ({ system, context }) => {
      const pluginId = id
      try {
        // First check if we're in a git repository
        const isGitRepo = await context.gitRepository.isGitRepository()
        if (!isGitRepo) {
          system.get(bus).send(emit(pluginId, {
            type: 'GIT_ERROR',
            data: { message: 'Not a git repository' }
          }))
          return
        }

        const [status, branch] = await Promise.all([
          context.gitRepository.getStatus(),
          context.gitRepository.getCurrentBranch()
        ])
        system.get(bus).send(emit(pluginId, {
          type: 'GIT_STATUS',
          data: { files: status, branch }
        }))
      } catch (error: any) {
        // Handle specific git errors
        let errorMessage = error.message
        if (error.message.includes('git: command not found') || error.message.includes('\'git\' is not recognized')) {
          errorMessage = 'Git is not installed. Please install Git to use version control features.'
        } else if (error.message.includes('not a git repository')) {
          errorMessage = 'This directory is not a Git repository. Initialize with "git init" first.'
        }

        system.get(bus).send(emit(pluginId, {
          type: 'GIT_ERROR',
          data: { message: errorMessage }
        }))
      }
    },

    getGitDiff: async ({ system, event, context }) => {
      const ev = typeOf('GET_GIT_DIFF', event)
      const pluginId = id
      try {
        const diff = await context.gitRepository.getDiff(ev.path, ev.staged || false)

        // Get the file status to determine what content to fetch
        const status = await context.gitRepository.getStatus()
        const fileStatus = status.find(f => f.path === ev.path)

        let originalContent = ''
        let modifiedContent = ''

        if (fileStatus) {
          if (fileStatus.status === 'added' || fileStatus.status === 'untracked') {
            // New file - original is empty, modified is current file
            originalContent = ''
            modifiedContent = await context.gitRepository.getFileContent(ev.path!, 'working')
          } else if (fileStatus.status === 'deleted') {
            // Deleted file - original is from HEAD, modified is empty
            originalContent = await context.gitRepository.getFileContent(ev.path!, 'HEAD')
            modifiedContent = ''
          } else {
            // Modified file - get both versions
            originalContent = await context.gitRepository.getFileContent(ev.path!, 'HEAD')
            modifiedContent = await context.gitRepository.getFileContent(ev.path!, 'working')
          }
        }

        system.get(bus).send(emit(pluginId, {
          type: 'GIT_DIFF',
          data: {
            path: ev.path || 'all',
            diff,
            staged: ev.staged || false,
            originalContent,
            modifiedContent
          }
        }))
      } catch (error: any) {
        system.get(bus).send(emit(pluginId, {
          type: 'GIT_ERROR',
          data: { message: error.message }
        }))
      }
    },

    stageFiles: async ({ system, event, context, self }) => {
      const ev = typeOf('STAGE_FILES', event)
      const pluginId = id
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

    unstageFiles: async ({ system, event, context, self }) => {
      const ev = typeOf('UNSTAGE_FILES', event)
      const pluginId = id
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

    revertFile: async ({ system, event, context, self }) => {
      const ev = typeOf('REVERT_FILE', event)
      const pluginId = id
      try {
        await context.gitRepository.revertFile(ev.path)
        system.get(bus).send(emit(pluginId, {
          type: 'FILE_REVERTED',
          data: { path: ev.path }
        }))
        // Also send updated status
        self.send({ type: 'GET_GIT_STATUS' })
        // Notify frontend about file change
        system.get(bus).send(emit(pluginId, {
          type: 'FILE_CHANGED_EXTERNALLY',
          data: {
            path: ev.path,
            changeType: 'change',
            modifiedAt: new Date()
          }
        }))
      } catch (error: any) {
        system.get(bus).send(emit(pluginId, {
          type: 'GIT_ERROR',
          data: { message: error.message }
        }))
      }
    },

    commit: async ({ system, event, context, self }) => {
      const ev = typeOf('COMMIT', event)
      const pluginId = id
      try {
        // Check if there are any staged files
        const stagedFiles = await context.gitRepository.getStagedFiles()
        if (stagedFiles.length === 0) {
          system.get(bus).send(emit(pluginId, {
            type: 'GIT_ERROR',
            data: { message: 'No files staged for commit. Please stage files before committing.' }
          }))
          return
        }

        await context.gitRepository.commit(ev.message)
        system.get(bus).send(emit(pluginId, {
          type: 'COMMIT_SUCCESS',
          data: { message: ev.message }
        }))
        // Also send updated status
        self.send({ type: 'GET_GIT_STATUS' })
      } catch (error: any) {
        let errorMessage = error.message
        if (error.message.includes('nothing to commit')) {
          errorMessage = 'No changes to commit. Stage your changes first.'
        } else if (error.message.includes('Please tell me who you are')) {
          errorMessage = 'Git user not configured. Run "git config --global user.email" and "git config --global user.name"'
        }

        system.get(bus).send(emit(pluginId, {
          type: 'GIT_ERROR',
          data: { message: errorMessage }
        }))
      }
    },

    getCurrentBranch: async ({ system, context }) => {
      const pluginId = id
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
    },

    closeFile: async ({ event, context }) => {
      const ev = typeOf('CLOSE_FILE', event)
      try {
        // Stop watching the file when it's closed
        await context.fileWatcher.unwatchFile(ev.path)
      } catch (error) {
        console.error('Failed to unwatch file:', error)
      }
    },

    setupFileWatcher: ({ system, context }) => {
      const pluginId = id

      // Set up the callback for file changes
      context.fileWatcher.setChangeCallback((change: FileChangeInfo) => {
        // Invalidate git cache for changed files
        context.gitRepository.invalidateCache([change.path])

        system.get(bus).send(emit(pluginId, {
          type: 'FILE_CHANGED_EXTERNALLY',
          data: change
        }))
      })
    },

    setupGitWatcher: async ({ system, context }) => {
      const pluginId = id

      // Set up the callback for git changes
      context.gitWatcher.setChangeCallback(() => {
        // Clear git cache when git status changes
        context.gitRepository.clearCache()

        system.get(bus).send(emit(pluginId, {
          type: 'GIT_STATUS_CHANGED',
          data: { timestamp: new Date() }
        }))
      })

      // Start watching git changes
      await context.gitWatcher.startWatching()
    },

    restartGitWatcher: async ({ system, context }) => {
      const pluginId = id

      // Set up the callback for git changes (same as setup)
      context.gitWatcher.setChangeCallback(() => {
        // Clear git cache when git status changes
        context.gitRepository.clearCache()

        system.get(bus).send(emit(pluginId, {
          type: 'GIT_STATUS_CHANGED',
          data: { timestamp: new Date() }
        }))
      })

      // Start watching git changes in the new directory
      await context.gitWatcher.startWatching()
    },

    getBaseBranch: async ({ system, context }) => {
      const pluginId = id
      try {
        const branch = await context.gitRepository.getPRBaseBranch()
        system.get(bus).send(emit(pluginId, {
          type: 'BASE_BRANCH',
          data: { branch }
        }))
      } catch (error: any) {
        system.get(bus).send(emit(pluginId, {
          type: 'GIT_ERROR',
          data: { message: error.message }
        }))
      }
    },

    getBranchDiff: async ({ system, event, context }) => {
      const ev = typeOf('GET_BRANCH_DIFF', event)
      const pluginId = id
      try {
        const baseBranch = ev.baseBranch || await context.gitRepository.getPRBaseBranch()
        const files = await context.gitRepository.getBranchDiff(baseBranch)
        system.get(bus).send(emit(pluginId, {
          type: 'BRANCH_DIFF',
          data: { files, baseBranch }
        }))
      } catch (error: any) {
        system.get(bus).send(emit(pluginId, {
          type: 'GIT_ERROR',
          data: { message: error.message }
        }))
      }
    },

    getBranchFileDiff: async ({ system, event, context }) => {
      const ev = typeOf('GET_BRANCH_FILE_DIFF', event)
      const pluginId = id
      try {
        const diff = await context.gitRepository.getFileDiffBetweenBranches(ev.path, ev.baseBranch)

        // Get file content from both branches
        const originalContent = await context.gitRepository.getFileContentFromBranch(ev.path, ev.baseBranch)
        const modifiedContent = await context.gitRepository.getFileContentFromBranch(ev.path, 'HEAD')

        system.get(bus).send(emit(pluginId, {
          type: 'BRANCH_FILE_DIFF',
          data: {
            path: ev.path,
            diff,
            staged: false,
            originalContent,
            modifiedContent
          }
        }))
      } catch (error: any) {
        system.get(bus).send(emit(pluginId, {
          type: 'GIT_ERROR',
          data: { message: error.message }
        }))
      }
    },

    // Terminal actions
    createTerminal: ({ system, event, context }) => {
      const ev = typeOf('CREATE_TERMINAL', event)
      const pluginId = id
      try {
        const terminalInfo = terminalService.create({
          title: ev.title,
          cwd: ev.cwd || context.currentDirectory,
          shell: ev.shell,
          cols: ev.cols || 80,
          rows: ev.rows || 24
        })

        // Set up output handler
        terminalService.onData(terminalInfo.id, (data) => {
          // Send to frontend
          system.get(bus).send(emit(pluginId, {
            type: 'TERMINAL_OUTPUT',
            data: { terminalId: terminalInfo.id, data }
          }))
        })

        // Set up exit handler
        terminalService.onExit(terminalInfo.id, (exitCode, signal) => {
          system.get(bus).send(emit(pluginId, {
            type: 'TERMINAL_CLOSED',
            data: { terminalId: terminalInfo.id }
          }))
        })

        system.get(bus).send(emit(pluginId, {
          type: 'TERMINAL_CREATED',
          data: terminalInfo
        }))
      } catch (error: any) {
        system.get(bus).send(emit(pluginId, {
          type: 'TERMINAL_ERROR',
          data: { message: error.message }
        }))
      }
    },

    closeTerminal: ({ system, event }) => {
      const ev = typeOf('CLOSE_TERMINAL', event)
      const pluginId = id
      try {
        const success = terminalService.kill(ev.terminalId)
        if (!success) {
          system.get(bus).send(emit(pluginId, {
            type: 'TERMINAL_ERROR',
            data: { message: `Terminal ${ev.terminalId} not found`, terminalId: ev.terminalId }
          }))
        }
      } catch (error: any) {
        system.get(bus).send(emit(pluginId, {
          type: 'TERMINAL_ERROR',
          data: { message: error.message, terminalId: ev.terminalId }
        }))
      }
    },

    sendTerminalInput: ({ system, event }) => {
      const ev = typeOf('TERMINAL_INPUT', event)
      const pluginId = id
      try {
        const success = terminalService.write(ev.terminalId, ev.data)
        if (!success) {
          system.get(bus).send(emit(pluginId, {
            type: 'TERMINAL_ERROR',
            data: { message: `Terminal ${ev.terminalId} not found`, terminalId: ev.terminalId }
          }))
        }
      } catch (error: any) {
        system.get(bus).send(emit(pluginId, {
          type: 'TERMINAL_ERROR',
          data: { message: error.message, terminalId: ev.terminalId }
        }))
      }
    },

    resizeTerminal: ({ system, event }) => {
      const ev = typeOf('RESIZE_TERMINAL', event)
      const pluginId = id
      try {
        const success = terminalService.resize(ev.terminalId, ev.cols, ev.rows)
        if (!success) {
          system.get(bus).send(emit(pluginId, {
            type: 'TERMINAL_ERROR',
            data: { message: `Terminal ${ev.terminalId} not found`, terminalId: ev.terminalId }
          }))
        }
      } catch (error: any) {
        system.get(bus).send(emit(pluginId, {
          type: 'TERMINAL_ERROR',
          data: { message: error.message, terminalId: ev.terminalId }
        }))
      }
    },

    listTerminals: ({ system }) => {
      const pluginId = id
      try {
        const terminals = terminalService.list()
        system.get(bus).send(emit(pluginId, {
          type: 'TERMINALS_LIST',
          data: terminals
        }))
      } catch (error: any) {
        system.get(bus).send(emit(pluginId, {
          type: 'TERMINAL_ERROR',
          data: { message: error.message }
        }))
      }
    },

    cleanupTerminals: () => {
      terminalService.killAll()
    },

    restoreTerminals: async ({ system }) => {
      const pluginId = id
      
      // Restore all active terminals from EARS
      await terminalService.restoreAll((terminalInfo) => {
        // Set up output handler for restored terminal
        terminalService.onData(terminalInfo.id, (data) => {
          system.get(bus).send(emit(pluginId, {
            type: 'TERMINAL_OUTPUT',
            data: { terminalId: terminalInfo.id, data }
          }))
        })

        // Set up exit handler for restored terminal
        terminalService.onExit(terminalInfo.id, (exitCode, signal) => {
          system.get(bus).send(emit(pluginId, {
            type: 'TERMINAL_CLOSED',
            data: { terminalId: terminalInfo.id }
          }))
        })
      })
      
      console.log('Terminal restoration complete')
    }
  },
}).createMachine({
  id,
  initial: 'idle',
  context: (() => {
    const rootDir = process.cwd().includes('/apps/api') ? process.cwd().replace('/apps/api', '') : process.cwd()
    return {
      currentDirectory: rootDir,
      rootDirectory: rootDir,
      repository: new FileSystemRepository(),
      gitRepository: new GitRepository(rootDir),
      fileWatcher: new FileWatcherService(),
      gitWatcher: new GitWatcherService(rootDir),
    }
  })(),
  entry: ['setupFileWatcher', 'setupGitWatcher', 'restoreTerminals'],
  states: {
    idle: {
      on: {
        CLIENT_CONNECTED: {
          actions: ['sendCurrentDirectory', 'sendStartupData'],
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
        REVERT_FILE: {
          actions: ['revertFile'],
        },
        COMMIT: {
          actions: ['commit'],
        },
        GET_CURRENT_BRANCH: {
          actions: ['getCurrentBranch'],
        },
        CLOSE_FILE: {
          actions: ['closeFile'],
        },
        GET_BASE_BRANCH: {
          actions: ['getBaseBranch'],
        },
        GET_BRANCH_DIFF: {
          actions: ['getBranchDiff'],
        },
        GET_BRANCH_FILE_DIFF: {
          actions: ['getBranchFileDiff'],
        },
        RESTART_GIT_WATCHER: {
          actions: ['restartGitWatcher'],
        },
        // Terminal events
        CREATE_TERMINAL: {
          actions: ['createTerminal'],
        },
        CLOSE_TERMINAL: {
          actions: ['closeTerminal'],
        },
        TERMINAL_INPUT: {
          actions: ['sendTerminalInput'],
        },
        RESIZE_TERMINAL: {
          actions: ['resizeTerminal'],
        },
        LIST_TERMINALS: {
          actions: ['listTerminals'],
        },
      },
    },
  },
  exit: ['cleanupTerminals'],
})