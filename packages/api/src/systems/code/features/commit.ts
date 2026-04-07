import { assign, setup } from 'xstate'
import { emit } from '@/core/helpers/actor-helpers'
import { rootEvents } from '@/core/router/bus-emitter'
import { systemBus } from '@/core/helpers/event-helpers'
import { z } from 'zod'
import { GitRepository } from '../services/git'
import { GitWatcherService } from '../services/gitwatcher'
import { GitStatusFile, GitDiff, StashEntry } from '../types'
import { requireGitRepository } from '../utils/git-helpers'
import * as copilotCli from '../services/copilot-cli'

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
  busEvent('commit.REVERT_FILES', { paths: z.array(z.string()) }),
  busEvent('commit.GET_ALL_BRANCHES', {}),
  busEvent('commit.CHECKOUT_BRANCH', { branchName: z.string() }),
  busEvent('commit.PUBLISH_BRANCH', {}),
  busEvent('commit.PULL_BRANCH', {}),
  busEvent('commit.GENERATE_MESSAGE', {}),
  busEvent('commit.STASH_PUSH', { message: z.string().optional(), stagedOnly: z.boolean().optional() }),
  busEvent('commit.STASH_LIST', {}),
  busEvent('commit.STASH_APPLY', { index: z.number() }),
  busEvent('commit.STASH_POP', { index: z.number() }),
  busEvent('commit.STASH_DROP', { index: z.number() }),
  busEvent('commit.STASH_CLEAR', {}),
] as const

// Outgoing events to frontend
export type OutgoingCommitEvents =
  | { type: 'commit.STATUS_RECEIVED'; data: { files: GitStatusFile[]; branch: string; hasUpstream: boolean; commitsAhead: number; commitsBehind: number } }
  | { type: 'commit.DIFF_RECEIVED'; data: GitDiff }
  | { type: 'commit.FILES_STAGED'; data: { paths: string[] } }
  | { type: 'commit.FILES_UNSTAGED'; data: { paths: string[] } }
  | { type: 'commit.COMMIT_SUCCESS'; data: { message: string } }
  | { type: 'commit.FILE_REVERTED'; data: { path: string } }
  | { type: 'commit.FILES_REVERTED'; data: { paths: string[] } }
  | { type: 'commit.ERROR_RECEIVED'; data: { message: string } }
  | { type: 'commit.BRANCH_RETRIEVED'; data: { branch: string } }
  | { type: 'commit.BRANCHES_RECEIVED'; data: { branches: string[] } }
  | { type: 'commit.BRANCH_CHECKOUT_SUCCESS'; data: { branchName: string } }
  | { type: 'commit.BRANCH_PUSHED'; data: { branchName: string } }
  | { type: 'commit.BRANCH_PULLED'; data: { branchName: string } }
  | { type: 'commit.MESSAGE_GENERATED'; data: { message: string } }
  | { type: 'commit.STASH_LIST_RECEIVED'; data: { stashes: StashEntry[] } }
  | { type: 'commit.STASH_SUCCESS'; data: { message: string } }

export interface Context {
  gitRepository: GitRepository | null
  gitWatcher: GitWatcherService | null
  _statusRefreshTimer?: ReturnType<typeof setTimeout>
}

export type Event = 
  | { type: 'commit.GET_GIT_STATUS' }
  | { type: 'commit.GET_GIT_DIFF'; path?: string; staged?: boolean }
  | { type: 'commit.STAGE_FILES'; paths: string[] }
  | { type: 'commit.UNSTAGE_FILES'; paths: string[] }
  | { type: 'commit.COMMIT'; message: string }
  | { type: 'commit.GET_CURRENT_BRANCH' }
  | { type: 'commit.REVERT_FILE'; path: string }
  | { type: 'commit.REVERT_FILES'; paths: string[] }
  | { type: 'commit.GET_ALL_BRANCHES' }
  | { type: 'commit.CHECKOUT_BRANCH'; branchName: string }
  | { type: 'commit.PUBLISH_BRANCH' }
  | { type: 'commit.PULL_BRANCH' }
  | { type: 'commit.GENERATE_MESSAGE' }
  | { type: 'commit.STASH_PUSH'; message?: string; stagedOnly?: boolean }
  | { type: 'commit.STASH_LIST' }
  | { type: 'commit.STASH_APPLY'; index: number }
  | { type: 'commit.STASH_POP'; index: number }
  | { type: 'commit.STASH_DROP'; index: number }
  | { type: 'commit.STASH_CLEAR' }
  | { type: 'commit.UPDATE_BASE_DIRECTORY'; path: string; gitRepository: GitRepository; gitWatcher: GitWatcherService }
  | { type: 'commit.GIT_STATUS_CHANGED' }
  | { type: 'CODE_CONNECTED' };

export const commitSystem = setup({
  types: {
    context: {} as Context,
    events: {} as Event,
    input: {} as { baseDirectory: string | null; gitRepository?: GitRepository | null; gitWatcher?: GitWatcherService | null }
  },
  actions: {
    // Git watcher is now managed by parent code system

    handleGitStatusChanged: ({ context, self, system }) => {
      // Debounce: collapse rapid status-change notifications into one refresh.
      // This prevents double-refresh from write-action + watcher both triggering.
      if (context._statusRefreshTimer) {
        clearTimeout(context._statusRefreshTimer)
      }
      context._statusRefreshTimer = setTimeout(() => {
        context._statusRefreshTimer = undefined
        self.send({ type: 'commit.GET_GIT_STATUS' })
      }, 150)

      // Also notify the PR system to refresh if it exists
      const prSystem = system.get('pr')
      if (prSystem) {
        prSystem.send({ type: 'pr.GIT_STATUS_CHANGED' })
      }
    },

    getGitStatus: async ({ context }) => {
      if (!requireGitRepository(context)) return
      
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
      
      if (!requireGitRepository(context)) return
      
      try {
        const diff = await context.gitRepository.getDiff(ev.path, ev.staged || false)

        // Get the file status to determine what content to fetch
        const status = await context.gitRepository.getStatus()
        const fileStatus = status.find(f => f.path === ev.path && f.staged === (ev.staged || false))

        let originalContent = ''
        let modifiedContent = ''

        if (fileStatus) {
          if (fileStatus.status === 'added' || fileStatus.status === 'untracked') {
            originalContent = ''
            modifiedContent = ev.staged
              ? await context.gitRepository.getFileContent(ev.path!, 'index')
              : await context.gitRepository.getFileContent(ev.path!, 'working')
          } else if (fileStatus.status === 'deleted') {
            originalContent = ev.staged
              ? await context.gitRepository.getFileContent(ev.path!, 'HEAD')
              : await context.gitRepository.getFileContent(ev.path!, 'index')
            modifiedContent = ''
          } else if (fileStatus.status === 'renamed' || fileStatus.status === 'copied') {
            // For renames/copies, the original content lives at the old path in HEAD
            const oldPath = fileStatus.originalPath || ev.path!
            if (ev.staged) {
              originalContent = await context.gitRepository.getFileContent(oldPath, 'HEAD')
              modifiedContent = await context.gitRepository.getFileContent(ev.path!, 'index')
            } else {
              originalContent = await context.gitRepository.getFileContent(ev.path!, 'index')
              modifiedContent = await context.gitRepository.getFileContent(ev.path!, 'working')
            }
          } else {
            if (ev.staged) {
              originalContent = await context.gitRepository.getFileContent(ev.path!, 'HEAD')
              modifiedContent = await context.gitRepository.getFileContent(ev.path!, 'index')
            } else {
              originalContent = await context.gitRepository.getFileContent(ev.path!, 'index')
              modifiedContent = await context.gitRepository.getFileContent(ev.path!, 'working')
            }
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

      if (!requireGitRepository(context)) return

      try {
        await context.gitRepository.stageFiles(ev.paths)
        const wrapped = emit(pluginId, {
          type: 'commit.FILES_STAGED',
          data: { paths: ev.paths }
        })
        rootEvents.emitOutgoing(wrapped.event)
        // Debounced status refresh (watcher may also trigger one — they coalesce)
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
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

      if (!requireGitRepository(context)) return

      try {
        // For renamed/copied files, we need to reset both old and new paths
        const status = await context.gitRepository.getStatus()
        const allPaths = new Set(ev.paths)
        for (const p of ev.paths) {
          const fileStatus = status.find(f => f.path === p)
          if (fileStatus && (fileStatus.status === 'renamed' || fileStatus.status === 'copied') && fileStatus.originalPath) {
            allPaths.add(fileStatus.originalPath)
          }
        }
        await context.gitRepository.unstageFiles([...allPaths])
        const wrapped = emit(pluginId, {
          type: 'commit.FILES_UNSTAGED',
          data: { paths: ev.paths }
        })
        rootEvents.emitOutgoing(wrapped.event)
        // Debounced status refresh (watcher may also trigger one — they coalesce)
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
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

      if (!requireGitRepository(context)) return

      try {
        await context.gitRepository.revertFile(ev.path)
        const wrapped = emit(pluginId, {
          type: 'commit.FILE_REVERTED',
          data: { path: ev.path }
        })
        rootEvents.emitOutgoing(wrapped.event)
        // Debounced status refresh
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
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

    revertFiles: async ({ event, context, self }) => {
      const ev = event as { type: 'commit.REVERT_FILES'; paths: string[] }

      if (!requireGitRepository(context)) return

      try {
        await context.gitRepository.revertFiles(ev.paths)
        const wrapped = emit(pluginId, {
          type: 'commit.FILES_REVERTED',
          data: { paths: ev.paths }
        })
        rootEvents.emitOutgoing(wrapped.event)
        // Debounced status refresh
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
        // Notify frontend about file changes
        for (const path of ev.paths) {
          const fileChangeWrapped = emit(pluginId, {
            type: 'explorer.FILE_CHANGED_EXTERNALLY',
            data: {
              path,
              changeType: 'change',
              modifiedAt: new Date()
            }
          })
          rootEvents.emitOutgoing(fileChangeWrapped.event)
        }
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
      
      if (!requireGitRepository(context)) return
      
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
        // Debounced status refresh
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
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
      if (!requireGitRepository(context)) return
      
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
      if (!requireGitRepository(context)) return
      
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
      
      if (!requireGitRepository(context)) return
      
      try {
        await context.gitRepository.checkoutBranch(ev.branchName)
        
        // Clear cache and refresh status after branch switch
        context.gitRepository.clearCache()
        
        const wrapped = emit(pluginId, {
          type: 'commit.BRANCH_CHECKOUT_SUCCESS',
          data: { branchName: ev.branchName }
        })
        rootEvents.emitOutgoing(wrapped.event)
        
        // Debounced status refresh
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
        
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
      if (!requireGitRepository(context)) return
      
      try {
        const currentBranch = await context.gitRepository.getCurrentBranch()
        await context.gitRepository.pushBranch()
        
        const wrapped = emit(pluginId, {
          type: 'commit.BRANCH_PUSHED',
          data: { branchName: currentBranch }
        })
        rootEvents.emitOutgoing(wrapped.event)
        
        // Debounced status refresh
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    generateCommitMessage: async ({ context }) => {
      if (!requireGitRepository(context)) return

      try {
        // Get diff: prefer staged, fall back to unstaged
        const stagedFiles = await context.gitRepository.getStagedFiles()
        let diff: string
        if (stagedFiles.length > 0) {
          diff = await context.gitRepository.getDiff(undefined, true)
        } else {
          diff = await context.gitRepository.getDiff(undefined, false)
        }

        if (!diff.trim()) {
          const wrapped = emit(pluginId, {
            type: 'commit.ERROR_RECEIVED',
            data: { message: 'No changes found to generate a commit message from.' }
          })
          rootEvents.emitOutgoing(wrapped.event)
          return
        }

        // Truncate diff to 40k chars
        const truncatedDiff = diff.length > 40000 ? diff.substring(0, 40000) + '\n... (truncated)' : diff

        const promptText = `Generate a concise git commit message for the following diff. Use conventional commits format (e.g., feat:, fix:, refactor:, docs:, chore:). Keep it to a single line, no markdown wrapping, no backticks. Just output the commit message text.\n\n${truncatedDiff}`

        const cwd = context.gitRepository.getWorkingDir()
        const message = await copilotCli.prompt(promptText, { cwd })

        if (!message) {
          const wrapped = emit(pluginId, {
            type: 'commit.ERROR_RECEIVED',
            data: { message: 'Copilot returned an empty response.' }
          })
          rootEvents.emitOutgoing(wrapped.event)
          return
        }

        const wrapped = emit(pluginId, {
          type: 'commit.MESSAGE_GENERATED',
          data: { message }
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

    pullBranch: async ({ context, self }) => {
      if (!requireGitRepository(context)) return
      
      try {
        const currentBranch = await context.gitRepository.getCurrentBranch()
        await context.gitRepository.pullBranch()
        
        const wrapped = emit(pluginId, {
          type: 'commit.BRANCH_PULLED',
          data: { branchName: currentBranch }
        })
        rootEvents.emitOutgoing(wrapped.event)
        
        // Debounced status refresh
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    updateBaseDirectory: assign({
      gitRepository: ({ event }) => {
        const ev = event as { type: 'commit.UPDATE_BASE_DIRECTORY'; path: string; gitRepository: GitRepository; gitWatcher: GitWatcherService }
        return ev.gitRepository
      },
      gitWatcher: ({ event }) => {
        const ev = event as { type: 'commit.UPDATE_BASE_DIRECTORY'; path: string; gitRepository: GitRepository; gitWatcher: GitWatcherService }
        return ev.gitWatcher
      }
    }),

    selfRefreshGitStatus: ({ self }) => {
      self.send({ type: 'commit.GIT_STATUS_CHANGED' })
    },

    stashPush: async ({ event, context, self }) => {
      const ev = event as { type: 'commit.STASH_PUSH'; message?: string; stagedOnly?: boolean }

      if (!requireGitRepository(context)) return

      try {
        const result = await context.gitRepository.stashPush(ev.message, ev.stagedOnly)
        const wrapped = emit(pluginId, {
          type: 'commit.STASH_SUCCESS',
          data: { message: result }
        })
        rootEvents.emitOutgoing(wrapped.event)
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
        self.send({ type: 'commit.STASH_LIST' })
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    stashList: async ({ context }) => {
      if (!requireGitRepository(context)) return

      try {
        const stashes = await context.gitRepository.stashList()
        const wrapped = emit(pluginId, {
          type: 'commit.STASH_LIST_RECEIVED',
          data: { stashes }
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

    stashApply: async ({ event, context, self }) => {
      const ev = event as { type: 'commit.STASH_APPLY'; index: number }

      if (!requireGitRepository(context)) return

      try {
        await context.gitRepository.stashApply(ev.index)
        const wrapped = emit(pluginId, {
          type: 'commit.STASH_SUCCESS',
          data: { message: 'Stash applied successfully' }
        })
        rootEvents.emitOutgoing(wrapped.event)
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    stashPop: async ({ event, context, self }) => {
      const ev = event as { type: 'commit.STASH_POP'; index: number }

      if (!requireGitRepository(context)) return

      try {
        await context.gitRepository.stashPop(ev.index)
        const wrapped = emit(pluginId, {
          type: 'commit.STASH_SUCCESS',
          data: { message: 'Stash popped successfully' }
        })
        rootEvents.emitOutgoing(wrapped.event)
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
        self.send({ type: 'commit.STASH_LIST' })
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    stashDrop: async ({ event, context, self }) => {
      const ev = event as { type: 'commit.STASH_DROP'; index: number }

      if (!requireGitRepository(context)) return

      try {
        await context.gitRepository.stashDrop(ev.index)
        self.send({ type: 'commit.STASH_LIST' })
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    stashClear: async ({ context, self }) => {
      if (!requireGitRepository(context)) return

      try {
        await context.gitRepository.stashClear()
        self.send({ type: 'commit.STASH_LIST' })
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    }
  }
}).createMachine({
  id: 'commit',
  initial: 'idle',
  context: ({ input }) => {
    const baseDir = input?.baseDirectory
    return {
      gitRepository: input?.gitRepository || (baseDir ? new GitRepository(baseDir) : null),
      gitWatcher: input?.gitWatcher || (baseDir ? new GitWatcherService(baseDir) : null)
    }
  },
  states: {
    idle: {
      on: {
        'CODE_CONNECTED': {
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
        'commit.REVERT_FILES': {
          actions: 'revertFiles'
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
        'commit.GENERATE_MESSAGE': {
          actions: 'generateCommitMessage'
        },
        'commit.UPDATE_BASE_DIRECTORY': {
          actions: ['updateBaseDirectory', 'selfRefreshGitStatus']
        },
        'commit.GIT_STATUS_CHANGED': {
          actions: 'handleGitStatusChanged'
        },
        'commit.STASH_PUSH': {
          actions: 'stashPush'
        },
        'commit.STASH_LIST': {
          actions: 'stashList'
        },
        'commit.STASH_APPLY': {
          actions: 'stashApply'
        },
        'commit.STASH_POP': {
          actions: 'stashPop'
        },
        'commit.STASH_DROP': {
          actions: 'stashDrop'
        },
        'commit.STASH_CLEAR': {
          actions: 'stashClear'
        }
      }
    }
  }
})