import { assign, setup } from 'xstate'
import { emit } from '@/core/utils/actor-helpers'
import { rootEvents } from '@/core/router/bus-emitter'
import { systemBus } from '@/core/utils/event-helpers'
import { z } from 'zod'
import { GitRepository } from '../services/git'
import { GitWatcherService } from '../services/gitwatcher'
import { GitStatusFile, GitDiff } from '../types'

const pluginId = 'code' as const
const busEvent = systemBus(pluginId)

// Incoming events from frontend
export const IncomingCommitEvents = [
  busEvent('commit.GET_GIT_STATUS', {}),
  busEvent('commit.GET_GIT_DIFF', { path: z.string().optional(), staged: z.boolean().optional() }),
  busEvent('commit.STAGE_FILES', { paths: z.array(z.string()) }),
  busEvent('commit.UNSTAGE_FILES', { paths: z.array(z.string()) }),
  busEvent('commit.COMMIT', { message: z.string() }),
  busEvent('commit.GET_CURRENT_BRANCH', {}),
  busEvent('commit.REVERT_FILE', { path: z.string() }),
  busEvent('commit.GET_ALL_BRANCHES', {}),
  busEvent('commit.CHECKOUT_BRANCH', { branchName: z.string() }),
  busEvent('commit.PUBLISH_BRANCH', {}),
  busEvent('commit.PULL_BRANCH', {}),
  busEvent('commit.GET_GIT_ROOT', {}),
] as const

// Outgoing events to frontend
export type OutgoingCommitEvents =
  | { type: 'commit.STATUS_RECEIVED'; data: { files: GitStatusFile[]; branch: string; hasUpstream: boolean; commitsAhead: number; commitsBehind: number } }
  | { type: 'commit.DIFF_RECEIVED'; data: GitDiff }
  | { type: 'commit.FILES_STAGED'; data: { paths: string[] } }
  | { type: 'commit.FILES_UNSTAGED'; data: { paths: string[] } }
  | { type: 'commit.COMMIT_SUCCESS'; data: { message: string } }
  | { type: 'commit.FILE_REVERTED'; data: { path: string } }
  | { type: 'commit.ERROR_RECEIVED'; data: { message: string } }
  | { type: 'commit.BRANCH_RETRIEVED'; data: { branch: string } }
  | { type: 'commit.BRANCHES_RECEIVED'; data: { branches: string[] } }
  | { type: 'commit.BRANCH_CHECKOUT_SUCCESS'; data: { branchName: string } }
  | { type: 'commit.BRANCH_PUSHED'; data: { branchName: string } }
  | { type: 'commit.BRANCH_PULLED'; data: { branchName: string } }
  | { type: 'commit.GIT_ROOT_RECEIVED'; data: { gitRoot: string } }

export interface Context {
  gitRepository: GitRepository
  gitWatcher: GitWatcherService
}

export type Event = 
  | { type: 'commit.GET_GIT_STATUS' }
  | { type: 'commit.GET_GIT_DIFF'; path?: string; staged?: boolean }
  | { type: 'commit.STAGE_FILES'; paths: string[] }
  | { type: 'commit.UNSTAGE_FILES'; paths: string[] }
  | { type: 'commit.COMMIT'; message: string }
  | { type: 'commit.GET_CURRENT_BRANCH' }
  | { type: 'commit.REVERT_FILE'; path: string }
  | { type: 'commit.GET_ALL_BRANCHES' }
  | { type: 'commit.CHECKOUT_BRANCH'; branchName: string }
  | { type: 'commit.PUBLISH_BRANCH' }
  | { type: 'commit.PULL_BRANCH' }
  | { type: 'commit.GET_GIT_ROOT' }
  | { type: 'commit.UPDATE_ROOT_DIRECTORY'; path: string }
  | { type: 'commit.GIT_STATUS_CHANGED' }
  | { type: 'CODE_STARTUP' };

export const commitSystem = setup({
  types: {
    context: {} as Context,
    events: {} as Event,
    input: {} as { rootDirectory: string }
  },
  actions: {
    setupGitWatcher: async ({ context, self }) => {
      // Set up the callback for git changes
      context.gitWatcher.setChangeCallback(() => {
        // Clear git cache when git status changes
        context.gitRepository.clearCache()
        
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
      })

      // Start watching git changes
      await context.gitWatcher.startWatching()
    },

    handleGitStatusChanged: async ({ context, self, system }) => {
      // When git status changes, automatically send the new status to frontend
      self.send({ type: 'commit.GET_GIT_STATUS' })
      
      // Also notify the PR system to refresh if it exists
      const prSystem = system.get('pr')
      if (prSystem) {
        prSystem.send({ type: 'pr.GIT_STATUS_CHANGED' })
      }
    },

    getGitStatus: async ({ context }) => {
      try {
        // First check if we're in a git repository
        const isGitRepo = await context.gitRepository.isGitRepository()
        if (!isGitRepo) {
          const wrapped = emit(pluginId, {
            type: 'commit.ERROR_RECEIVED',
            data: { message: 'Not a git repository' }
          })
          rootEvents.emitOutgoing(wrapped.event)
          return
        }

        const [status, branch, hasUpstream, commitsInfo] = await Promise.all([
          context.gitRepository.getStatus(),
          context.gitRepository.getCurrentBranch(),
          context.gitRepository.isCurrentBranchPublished(),
          context.gitRepository.getCommitsAheadBehind()
        ])
        const wrapped = emit(pluginId, {
          type: 'commit.STATUS_RECEIVED',
          data: { files: status, branch, hasUpstream, commitsAhead: commitsInfo.ahead, commitsBehind: commitsInfo.behind }
        })
        rootEvents.emitOutgoing(wrapped.event)
      } catch (error: any) {
        // Handle specific git errors
        let errorMessage = error.message
        if (error.message.includes('git: command not found') || error.message.includes('\'git\' is not recognized')) {
          errorMessage = 'Git is not installed. Please install Git to use version control features.'
        } else if (error.message.includes('not a git repository')) {
          errorMessage = 'This directory is not a Git repository. Initialize with "git init" first.'
        }

        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: errorMessage }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    getGitDiff: async ({ event, context }) => {
      const ev = event as { type: 'commit.GET_GIT_DIFF'; path?: string; staged?: boolean }
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

        const wrapped = emit(pluginId, {
          type: 'commit.DIFF_RECEIVED',
          data: {
            path: ev.path || 'all',
            diff,
            staged: ev.staged || false,
            originalContent,
            modifiedContent
          }
        })
        rootEvents.emitOutgoing(wrapped.event)
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    stageFiles: async ({ event, context, self }) => {
      const ev = event as { type: 'commit.STAGE_FILES'; paths: string[] }
      try {
        await context.gitRepository.stageFiles(ev.paths)
        const wrapped = emit(pluginId, {
          type: 'commit.FILES_STAGED',
          data: { paths: ev.paths }
        })
        rootEvents.emitOutgoing(wrapped.event)
        // Also send updated status
        self.send({ type: 'commit.GET_GIT_STATUS' })
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    unstageFiles: async ({ event, context, self }) => {
      const ev = event as { type: 'commit.UNSTAGE_FILES'; paths: string[] }
      try {
        await context.gitRepository.unstageFiles(ev.paths)
        const wrapped = emit(pluginId, {
          type: 'commit.FILES_UNSTAGED',
          data: { paths: ev.paths }
        })
        rootEvents.emitOutgoing(wrapped.event)
        // Also send updated status
        self.send({ type: 'commit.GET_GIT_STATUS' })
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    revertFile: async ({ event, context, self }) => {
      const ev = event as { type: 'commit.REVERT_FILE'; path: string }
      try {
        await context.gitRepository.revertFile(ev.path)
        const wrapped = emit(pluginId, {
          type: 'commit.FILE_REVERTED',
          data: { path: ev.path }
        })
        rootEvents.emitOutgoing(wrapped.event)
        // Also send updated status
        self.send({ type: 'commit.GET_GIT_STATUS' })
        // Notify frontend about file change
        const fileChangeWrapped = emit(pluginId, {
          type: 'explorer.FILE_CHANGED_EXTERNALLY',
          data: {
            path: ev.path,
            changeType: 'change',
            modifiedAt: new Date()
          }
        })
        rootEvents.emitOutgoing(fileChangeWrapped.event)
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    commit: async ({ event, context, self }) => {
      const ev = event as { type: 'commit.COMMIT'; message: string }
      try {
        // Check if there are any staged files
        const stagedFiles = await context.gitRepository.getStagedFiles()
        if (stagedFiles.length === 0) {
          const wrapped = emit(pluginId, {
            type: 'commit.ERROR_RECEIVED',
            data: { message: 'No files staged for commit. Please stage files before committing.' }
          })
          rootEvents.emitOutgoing(wrapped.event)
          return
        }

        await context.gitRepository.commit(ev.message)
        const wrapped = emit(pluginId, {
          type: 'commit.COMMIT_SUCCESS',
          data: { message: ev.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
        // Also send updated status
        self.send({ type: 'commit.GET_GIT_STATUS' })
      } catch (error: any) {
        let errorMessage = error.message
        if (error.message.includes('nothing to commit')) {
          errorMessage = 'No changes to commit. Stage your changes first.'
        } else if (error.message.includes('Please tell me who you are')) {
          errorMessage = 'Git user not configured. Run "git config --global user.email" and "git config --global user.name"'
        }

        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: errorMessage }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    getCurrentBranch: async ({ context }) => {
      try {
        const branch = await context.gitRepository.getCurrentBranch()
        const wrapped = emit(pluginId, {
          type: 'commit.BRANCH_RETRIEVED',
          data: { branch }
        })
        rootEvents.emitOutgoing(wrapped.event)
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    getAllBranches: async ({ context }) => {
      try {
        const branches = await context.gitRepository.getAllBranches()
        const wrapped = emit(pluginId, {
          type: 'commit.BRANCHES_RECEIVED',
          data: { branches }
        })
        rootEvents.emitOutgoing(wrapped.event)
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    checkoutBranch: async ({ event, context, self }) => {
      const ev = event as { type: 'commit.CHECKOUT_BRANCH'; branchName: string }
      try {
        await context.gitRepository.checkoutBranch(ev.branchName)
        
        // Clear cache and refresh status after branch switch
        context.gitRepository.clearCache()
        
        const wrapped = emit(pluginId, {
          type: 'commit.BRANCH_CHECKOUT_SUCCESS',
          data: { branchName: ev.branchName }
        })
        rootEvents.emitOutgoing(wrapped.event)
        
        // Refresh git status to show new branch
        self.send({ type: 'commit.GET_GIT_STATUS' })
        
        // Also notify PR system about branch change
        const prSystem = self.system.get('pr')
        if (prSystem) {
          prSystem.send({ type: 'pr.GIT_STATUS_CHANGED' })
        }
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    pushBranch: async ({ context, self }) => {
      try {
        const currentBranch = await context.gitRepository.getCurrentBranch()
        await context.gitRepository.pushBranch()
        
        const wrapped = emit(pluginId, {
          type: 'commit.BRANCH_PUSHED',
          data: { branchName: currentBranch }
        })
        rootEvents.emitOutgoing(wrapped.event)
        
        // Refresh git status to show updated upstream status
        self.send({ type: 'commit.GET_GIT_STATUS' })
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    getGitRoot: async ({ context, self }) => {
      try {
        const gitRoot = await context.gitRepository.getGitRoot()
        const wrapped = emit(pluginId, {
          type: 'commit.GIT_ROOT_RECEIVED',
          data: { gitRoot }
        })
        rootEvents.emitOutgoing(wrapped.event)
      } catch (error) {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error instanceof Error ? error.message : 'Failed to get git root' }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    pullBranch: async ({ context, self }) => {
      try {
        const currentBranch = await context.gitRepository.getCurrentBranch()
        await context.gitRepository.pullBranch()
        
        const wrapped = emit(pluginId, {
          type: 'commit.BRANCH_PULLED',
          data: { branchName: currentBranch }
        })
        rootEvents.emitOutgoing(wrapped.event)
        
        // Refresh git status to show updated state
        self.send({ type: 'commit.GET_GIT_STATUS' })
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    updateRootDirectory: assign({
      gitRepository: ({ event, context }) => {
        const ev = event as { type: 'commit.UPDATE_ROOT_DIRECTORY'; path: string }
        // Clear the old repository's cache before creating new one
        if (context.gitRepository) {
          context.gitRepository.clearCache()
        }
        // Use the new root directory path for git operations
        return new GitRepository(ev.path)
      },
      gitWatcher: ({ event, context }) => {
        const ev = event as { type: 'commit.UPDATE_ROOT_DIRECTORY'; path: string }
        // Stop the old watcher before creating new one
        if (context.gitWatcher) {
          context.gitWatcher.stopWatching()
        }
        // Create new watcher for the new directory
        return new GitWatcherService(ev.path)
      }
    }),

    restartGitWatcher: async ({ context, self }) => {
      // Re-setup the watcher after directory change
      await context.gitWatcher.startWatching()
    }
  }
}).createMachine({
  id: 'commit',
  initial: 'idle',
  context: ({ input }: { input?: { rootDirectory: string } }) => {
    const rootDir = input?.rootDirectory || process.cwd()
    return {
      gitRepository: new GitRepository(rootDir),
      gitWatcher: new GitWatcherService(rootDir)
    }
  },
  entry: 'setupGitWatcher',
  states: {
    idle: {
      on: {
        'CODE_STARTUP': {
          // No specific action needed for commit on startup
        },
        'commit.GET_GIT_STATUS': {
          actions: 'getGitStatus'
        },
        'commit.GET_GIT_DIFF': {
          actions: 'getGitDiff'
        },
        'commit.STAGE_FILES': {
          actions: 'stageFiles'
        },
        'commit.UNSTAGE_FILES': {
          actions: 'unstageFiles'
        },
        'commit.REVERT_FILE': {
          actions: 'revertFile'
        },
        'commit.COMMIT': {
          actions: 'commit'
        },
        'commit.GET_CURRENT_BRANCH': {
          actions: 'getCurrentBranch'
        },
        'commit.GET_ALL_BRANCHES': {
          actions: 'getAllBranches'
        },
        'commit.CHECKOUT_BRANCH': {
          actions: 'checkoutBranch'
        },
        'commit.PUBLISH_BRANCH': {
          actions: 'pushBranch'
        },
        'commit.PULL_BRANCH': {
          actions: 'pullBranch'
        },
        'commit.GET_GIT_ROOT': {
          actions: 'getGitRoot'
        },
        'commit.UPDATE_ROOT_DIRECTORY': {
          actions: ['updateRootDirectory', 'restartGitWatcher']
        },
        'commit.GIT_STATUS_CHANGED': {
          actions: 'handleGitStatusChanged'
        }
      }
    }
  }
})