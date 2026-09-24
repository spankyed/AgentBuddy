import type { IncomingCommitEvents, OutgoingCommitEvents } from '../contract'
import type { ThreadsSettings } from '@/__generated__/types';
import { services } from '@/__generated__/services';
import { broadcastToPlugin, sendToSystem } from '@/__generated__/events';
import { assign, setup, type AnyActorRef } from 'xstate'

import { GitRepository, StashConflictError } from '../services/git'
import { GitWatcherService } from '../services/gitwatcher'
import type { GitStatusFile, GitDiff, StashEntry, WorktreeEntry, CommitLogEntry } from '../types'
import { requireGitRepository } from '../utils/git-helpers'
import { repository } from '@/__generated__/repository';
import { ref } from '@/__generated__/ref';

const pluginId = 'code' as const

// Incoming events from frontend

// Outgoing events to frontend

export interface Context {
  gitRepository: GitRepository | null
  gitWatcher: GitWatcherService | null
  /** The code system, which routes a `pr.*` event to its pull request child */
  code?: AnyActorRef
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
  | { type: 'commit.WORKTREE_LIST' }
  | { type: 'commit.WORKTREE_ADD'; path: string; branch?: string; createBranch?: boolean }
  | { type: 'commit.WORKTREE_REMOVE'; path: string; force?: boolean }
  | { type: 'commit.WORKTREE_SWITCH'; path: string }
  | { type: 'commit.RESOLVE_CONFLICT'; path: string; strategy: 'ours' | 'theirs' }
  | { type: 'commit.MARK_RESOLVED'; path: string }
  | { type: 'commit.RESOLVE_ALL_CONFLICTS'; strategy: 'ours' | 'theirs' }
  | { type: 'commit.LOG_LIST' }
  | { type: 'commit.REVERT_COMMIT'; hash: string }
  | { type: 'commit.RESET_TO_COMMIT'; hash: string }
  | { type: 'commit.UPDATE_BASE_DIRECTORY'; path: string; gitRepository: GitRepository; gitWatcher: GitWatcherService }
  | { type: 'commit.GIT_STATUS_CHANGED' }
  | { type: 'CODE_CONNECTED' };

export const commitSystem = setup({
  types: {
    context: {} as Context,
    events: {} as Event,
    input: {} as { baseDirectory: string | null; gitRepository?: GitRepository | null; gitWatcher?: GitWatcherService | null; code?: AnyActorRef }
  },
  actions: {
    handleGitStatusChanged: ({ context, self }) => {
      // Debounce: collapse rapid status-change notifications into one refresh.
      // This prevents double-refresh from write-action + watcher both triggering.
      if (context._statusRefreshTimer) {
        clearTimeout(context._statusRefreshTimer)
      }
      context._statusRefreshTimer = setTimeout(() => {
        context._statusRefreshTimer = undefined
        self.send({ type: 'commit.GET_GIT_STATUS' })
        self.send({ type: 'commit.LOG_LIST' })
      }, 150)

      // Also notify the PR system to refresh
      context.code?.send({ type: 'pr.GIT_STATUS_CHANGED' })
    },

    getGitStatus: ({ context }) => {
      if (!requireGitRepository(context)) return

      context.gitRepository.isGitRepository().then((isGitRepo) => {
        if (!isGitRepo) {
          broadcastToPlugin(pluginId, {
            type: 'commit.ERROR_RECEIVED',
            data: { message: 'Not a git repository' }
          })
          return
        }

        return Promise.all([
          context.gitRepository!.getStatus(),
          context.gitRepository!.getCurrentBranch(),
          context.gitRepository!.isCurrentBranchPublished(),
          context.gitRepository!.getCommitsAheadBehind()
        ]).then(([status, branch, hasUpstream, commitsInfo]) => {
          broadcastToPlugin(pluginId, {
            type: 'commit.STATUS_RECEIVED',
            data: { files: status, branch, hasUpstream, commitsAhead: commitsInfo.ahead, commitsBehind: commitsInfo.behind }
          })
        })
      }).catch((error: any) => {
        let errorMessage = error.message
        if (error.message.includes('git: command not found') || error.message.includes('\'git\' is not recognized')) {
          errorMessage = 'Git is not installed. Please install Git to use version control features.'
        } else if (error.message.includes('not a git repository')) {
          errorMessage = 'This directory is not a Git repository. Initialize with "git init" first.'
        }

        broadcastToPlugin(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: errorMessage }
        })
      })
    },

    getGitDiff: ({ event, context }) => {
      const ev = event as { type: 'commit.GET_GIT_DIFF'; path?: string; staged?: boolean }

      if (!requireGitRepository(context)) return

      const isImage = ev.path ? context.gitRepository!.isImageFile(ev.path) : false
      const getContent = isImage
        ? (p: string, v: 'HEAD' | 'working' | 'index') => context.gitRepository!.getFileContentAsDataUrl(p, v)
        : (p: string, v: 'HEAD' | 'working' | 'index') => context.gitRepository!.getFileContent(p, v)

      Promise.all([
        context.gitRepository!.getDiff(ev.path, ev.staged || false),
        context.gitRepository!.getStatus()
      ]).then(async ([diff, status]) => {
        const fileStatus = status.find(f => f.path === ev.path && f.staged === (ev.staged || false))

        let originalContent = ''
        let modifiedContent = ''

        if (fileStatus) {
          if (fileStatus.status === 'added' || fileStatus.status === 'untracked') {
            originalContent = ''
            modifiedContent = ev.staged
              ? await getContent(ev.path!, 'index')
              : await getContent(ev.path!, 'working')
          } else if (fileStatus.status === 'deleted') {
            originalContent = ev.staged
              ? await getContent(ev.path!, 'HEAD')
              : await getContent(ev.path!, 'index')
            modifiedContent = ''
          } else if (fileStatus.status === 'renamed' || fileStatus.status === 'copied') {
            const oldPath = fileStatus.originalPath || ev.path!
            if (ev.staged) {
              originalContent = await getContent(oldPath, 'HEAD')
              modifiedContent = await getContent(ev.path!, 'index')
            } else {
              originalContent = await getContent(ev.path!, 'index')
              modifiedContent = await getContent(ev.path!, 'working')
            }
          } else if (fileStatus.status === 'unmerged') {
            originalContent = await getContent(ev.path!, 'HEAD')
            modifiedContent = await getContent(ev.path!, 'working')
          } else {
            if (ev.staged) {
              originalContent = await getContent(ev.path!, 'HEAD')
              modifiedContent = await getContent(ev.path!, 'index')
            } else {
              originalContent = await getContent(ev.path!, 'index')
              modifiedContent = await getContent(ev.path!, 'working')
            }
          }
        }

        broadcastToPlugin(pluginId, {
          type: 'commit.DIFF_RECEIVED',
          data: {
            path: ev.path || 'all',
            diff,
            staged: ev.staged || false,
            originalContent,
            modifiedContent,
            isImage
          }
        })
      }).catch((error: any) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
      })
    },

    stageFiles: ({ event, context, self }) => {
      const ev = event as { type: 'commit.STAGE_FILES'; paths: string[] }

      if (!requireGitRepository(context)) return

      context.gitRepository.stageFiles(ev.paths).then(() => {
        broadcastToPlugin(pluginId, {
          type: 'commit.FILES_STAGED',
          data: { paths: ev.paths }
        })
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
      }).catch((error: any) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
      })
    },

    unstageFiles: ({ event, context, self }) => {
      const ev = event as { type: 'commit.UNSTAGE_FILES'; paths: string[] }

      if (!requireGitRepository(context)) return

      context.gitRepository.getStatus().then((status) => {
        const allPaths = new Set(ev.paths)
        for (const p of ev.paths) {
          const fileStatus = status.find(f => f.path === p)
          if (fileStatus && (fileStatus.status === 'renamed' || fileStatus.status === 'copied') && fileStatus.originalPath) {
            allPaths.add(fileStatus.originalPath)
          }
        }
        return context.gitRepository!.unstageFiles([...allPaths])
      }).then(() => {
        broadcastToPlugin(pluginId, {
          type: 'commit.FILES_UNSTAGED',
          data: { paths: ev.paths }
        })
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
      }).catch((error: any) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
      })
    },

    revertFile: ({ event, context, self }) => {
      const ev = event as { type: 'commit.REVERT_FILE'; path: string }

      if (!requireGitRepository(context)) return

      context.gitRepository.revertFile(ev.path).then(() => {
        broadcastToPlugin(pluginId, {
          type: 'commit.FILE_REVERTED',
          data: { path: ev.path }
        })
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
        broadcastToPlugin(pluginId, {
          type: 'explorer.FILE_CHANGED_EXTERNALLY',
          data: {
            path: ev.path,
            changeType: 'change',
            modifiedAt: new Date()
          }
        })
      }).catch((error: any) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
      })
    },

    revertFiles: ({ event, context, self }) => {
      const ev = event as { type: 'commit.REVERT_FILES'; paths: string[] }

      if (!requireGitRepository(context)) return

      context.gitRepository.revertFiles(ev.paths).then(() => {
        broadcastToPlugin(pluginId, {
          type: 'commit.FILES_REVERTED',
          data: { paths: ev.paths }
        })
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
        for (const path of ev.paths) {
          broadcastToPlugin(pluginId, {
            type: 'explorer.FILE_CHANGED_EXTERNALLY',
            data: {
              path,
              changeType: 'change',
              modifiedAt: new Date()
            }
          })
        }
      }).catch((error: any) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
      })
    },

    resolveConflict: ({ event, context, self }) => {
      const ev = event as { type: 'commit.RESOLVE_CONFLICT'; path: string; strategy: 'ours' | 'theirs' }
      if (!requireGitRepository(context)) return

      context.gitRepository.resolveConflict(ev.path, ev.strategy).then(() => {
        broadcastToPlugin(pluginId, {
          type: 'commit.CONFLICT_RESOLVED',
          data: { path: ev.path }
        })
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
      }).catch((error: any) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
      })
    },

    markResolved: ({ event, context, self }) => {
      const ev = event as { type: 'commit.MARK_RESOLVED'; path: string }
      if (!requireGitRepository(context)) return

      context.gitRepository.stageFiles([ev.path]).then(() => {
        broadcastToPlugin(pluginId, {
          type: 'commit.CONFLICT_RESOLVED',
          data: { path: ev.path }
        })
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
      }).catch((error: any) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
      })
    },

    resolveAllConflicts: ({ event, context, self }) => {
      const ev = event as { type: 'commit.RESOLVE_ALL_CONFLICTS'; strategy: 'ours' | 'theirs' }
      if (!requireGitRepository(context)) return

      context.gitRepository.getStatus().then(async (status) => {
        const unmerged = status.filter(f => f.status === 'unmerged')
        for (const f of unmerged) {
          await context.gitRepository!.resolveConflict(f.path, ev.strategy)
        }
        broadcastToPlugin(pluginId, { type: 'commit.ALL_CONFLICTS_RESOLVED' })
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
      }).catch((error: any) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
      })
    },

    commit: ({ event, context, self }) => {
      const ev = event as { type: 'commit.COMMIT'; message: string }

      if (!requireGitRepository(context)) return

      context.gitRepository.getStagedFiles().then((stagedFiles) => {
        if (stagedFiles.length === 0) {
          broadcastToPlugin(pluginId, {
            type: 'commit.ERROR_RECEIVED',
            data: { message: 'No files staged for commit. Please stage files before committing.' }
          })
          return
        }

        return context.gitRepository!.commit(ev.message).then(() => {
          broadcastToPlugin(pluginId, {
            type: 'commit.COMMIT_SUCCESS',
            data: { message: ev.message }
          })
          self.send({ type: 'commit.GIT_STATUS_CHANGED' })
        })
      }).catch((error: any) => {
        let errorMessage = error.message
        if (error.message.includes('nothing to commit')) {
          errorMessage = 'No changes to commit. Stage your changes first.'
        } else if (error.message.includes('Please tell me who you are')) {
          errorMessage = 'Git user not configured. Run "git config --global user.email" and "git config --global user.name"'
        }

        broadcastToPlugin(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: errorMessage }
        })
      })
    },

    getCurrentBranch: ({ context }) => {
      if (!requireGitRepository(context)) return

      context.gitRepository.getCurrentBranch().then((branch) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.BRANCH_RETRIEVED',
          data: { branch }
        })
      }).catch((error: any) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
      })
    },

    getAllBranches: ({ context }) => {
      if (!requireGitRepository(context)) return

      context.gitRepository.getAllBranches().then((branches) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.BRANCHES_RECEIVED',
          data: { branches }
        })
      }).catch((error: any) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
      })
    },

    checkoutBranch: ({ event, context, self }) => {
      const ev = event as { type: 'commit.CHECKOUT_BRANCH'; branchName: string }

      if (!requireGitRepository(context)) return

      context.gitRepository.checkoutBranch(ev.branchName).then(() => {
        context.gitRepository!.clearCache()

        broadcastToPlugin(pluginId, {
          type: 'commit.BRANCH_CHECKOUT_SUCCESS',
          data: { branchName: ev.branchName }
        })

        self.send({ type: 'commit.GIT_STATUS_CHANGED' })

        context.code?.send({ type: 'pr.GIT_STATUS_CHANGED' })
      }).catch((error: any) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
      })
    },

    pushBranch: ({ context, self }) => {
      if (!requireGitRepository(context)) return

      let branchName: string
      context.gitRepository.getCurrentBranch().then((currentBranch) => {
        branchName = currentBranch
        return context.gitRepository!.pushBranch()
      }).then(() => {
        broadcastToPlugin(pluginId, {
          type: 'commit.BRANCH_PUSHED',
          data: { branchName }
        })
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
      }).catch((error: any) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
      })
    },

    generateCommitMessage: ({ context }) => {
      if (!requireGitRepository(context)) return

      context.gitRepository.getStagedFiles().then((stagedFiles) => {
        const staged = stagedFiles.length > 0
        return context.gitRepository!.getDiff(undefined, staged)
      }).then(async (diff) => {
        if (!diff.trim()) {
          broadcastToPlugin(pluginId, {
            type: 'commit.ERROR_RECEIVED',
            data: { message: 'No changes found to generate a commit message from.' }
          })
          return
        }

        const truncatedDiff = diff.length > 40000 ? diff.substring(0, 40000) + '\n... (truncated)' : diff

        const branch = await context.gitRepository!.getCurrentBranch()
        const repoDir = context.gitRepository!.getWorkingDir()
        const repoName = repoDir.split('/').pop() || ''

        const threadsSettings = services.settings.forFeature<ThreadsSettings>(ref('threads')) as any
        const provider = threadsSettings?.chat?.defaultMode || 'Claude Code'

        sendToSystem({ role: 'brain' }, { type: 'TRIGGER_BRAIN_EVENT', 
          eventType: 'commit.generate',
          payload: { diff: truncatedDiff, branch, repoName, provider },
        })
      }).catch((error: any) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
      })
    },

    pullBranch: ({ context, self }) => {
      if (!requireGitRepository(context)) return

      let branchName: string
      context.gitRepository.getCurrentBranch().then((currentBranch) => {
        branchName = currentBranch
        return context.gitRepository!.pullBranch()
      }).then(() => {
        context.gitRepository!.forceFetchOnce()

        broadcastToPlugin(pluginId, {
          type: 'commit.BRANCH_PULLED',
          data: { branchName }
        })
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
      }).catch((error: any) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
      })
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

    stashPush: ({ event, context, self }) => {
      const ev = event as { type: 'commit.STASH_PUSH'; message?: string; stagedOnly?: boolean }

      if (!requireGitRepository(context)) return

      context.gitRepository.stashPush(ev.message, ev.stagedOnly).then((result) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.STASH_SUCCESS',
          data: { message: result }
        })
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
        self.send({ type: 'commit.STASH_LIST' })
      }).catch((error: any) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
      })
    },

    stashList: ({ context }) => {
      if (!requireGitRepository(context)) return

      context.gitRepository.stashList().then((stashes) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.STASH_LIST_RECEIVED',
          data: { stashes }
        })
      }).catch((error: any) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
      })
    },

    stashApply: ({ event, context, self }) => {
      const ev = event as { type: 'commit.STASH_APPLY'; index: number }

      if (!requireGitRepository(context)) return

      context.gitRepository.stashApply(ev.index).then(() => {
        broadcastToPlugin(pluginId, {
          type: 'commit.STASH_SUCCESS',
          data: { message: 'Stash applied successfully' }
        })
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
      }).catch((error: any) => {
        if (error instanceof StashConflictError) {
          broadcastToPlugin(pluginId, {
            type: 'commit.STASH_SUCCESS',
            data: { message: error.message }
          })
          self.send({ type: 'commit.GIT_STATUS_CHANGED' })
          return
        }
        broadcastToPlugin(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
      })
    },

    stashPop: ({ event, context, self }) => {
      const ev = event as { type: 'commit.STASH_POP'; index: number }

      if (!requireGitRepository(context)) return

      context.gitRepository.stashPop(ev.index).then(() => {
        broadcastToPlugin(pluginId, {
          type: 'commit.STASH_SUCCESS',
          data: { message: 'Stash popped successfully' }
        })
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
        self.send({ type: 'commit.STASH_LIST' })
      }).catch((error: any) => {
        if (error instanceof StashConflictError) {
          broadcastToPlugin(pluginId, {
            type: 'commit.STASH_SUCCESS',
            data: { message: error.message }
          })
          self.send({ type: 'commit.GIT_STATUS_CHANGED' })
          self.send({ type: 'commit.STASH_LIST' })
          return
        }
        broadcastToPlugin(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
      })
    },

    stashDrop: ({ event, context, self }) => {
      const ev = event as { type: 'commit.STASH_DROP'; index: number }

      if (!requireGitRepository(context)) return

      context.gitRepository.stashDrop(ev.index).then(() => {
        self.send({ type: 'commit.STASH_LIST' })
      }).catch((error: any) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
      })
    },

    stashClear: ({ context, self }) => {
      if (!requireGitRepository(context)) return

      context.gitRepository.stashClear().then(() => {
        self.send({ type: 'commit.STASH_LIST' })
      }).catch((error: any) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
      })
    },

    logList: ({ context }) => {
      if (!requireGitRepository(context)) return

      context.gitRepository.gitLog().then((commits) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.LOG_LIST_RECEIVED',
          data: { commits }
        })
      }).catch((error: any) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
      })
    },

    revertCommit: ({ event, context, self }) => {
      const ev = event as { type: 'commit.REVERT_COMMIT'; hash: string }

      if (!requireGitRepository(context)) return

      context.gitRepository.revertCommit(ev.hash).then(() => {
        broadcastToPlugin(pluginId, {
          type: 'commit.REVERT_COMMIT_SUCCESS',
          data: { hash: ev.hash }
        })
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
        self.send({ type: 'commit.LOG_LIST' })
      }).catch((error: any) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
      })
    },

    resetToCommit: ({ event, context, self }) => {
      const ev = event as { type: 'commit.RESET_TO_COMMIT'; hash: string }

      if (!requireGitRepository(context)) return

      context.gitRepository.resetToCommit(ev.hash).then(() => {
        broadcastToPlugin(pluginId, {
          type: 'commit.RESET_COMMIT_SUCCESS',
          data: { hash: ev.hash }
        })
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
        self.send({ type: 'commit.LOG_LIST' })
      }).catch((error: any) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
      })
    },

    worktreeList: ({ context }) => {
      if (!requireGitRepository(context)) return

      context.gitRepository.worktreeList().then((worktrees) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.WORKTREE_LIST_RECEIVED',
          data: { worktrees }
        })
      }).catch((error: any) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
      })
    },

    worktreeAdd: ({ event, context, self }) => {
      if (!requireGitRepository(context)) return
      const ev = event as { type: 'commit.WORKTREE_ADD'; path: string; branch?: string; createBranch?: boolean }

      context.gitRepository.worktreeAdd(ev.path, ev.branch, ev.createBranch).then(() => {
        broadcastToPlugin(pluginId, {
          type: 'commit.WORKTREE_ADDED',
          data: { path: ev.path, branch: ev.branch || '' }
        })
        self.send({ type: 'commit.WORKTREE_LIST' })
      }).catch((error: any) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
      })
    },

    worktreeRemove: ({ event, context, self }) => {
      if (!requireGitRepository(context)) return
      const ev = event as { type: 'commit.WORKTREE_REMOVE'; path: string; force?: boolean }

      context.gitRepository.worktreeRemove(ev.path, ev.force).then(() => {
        broadcastToPlugin(pluginId, {
          type: 'commit.WORKTREE_REMOVED',
          data: { path: ev.path }
        })
        self.send({ type: 'commit.WORKTREE_LIST' })
      }).catch((error: any) => {
        broadcastToPlugin(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
      })
    }
  }
}).createMachine({
  id: 'commit',
  initial: 'idle',
  context: ({ input }) => {
    const baseDir = input?.baseDirectory
    return {
      gitRepository: input?.gitRepository || (baseDir ? new GitRepository(baseDir) : null),
      gitWatcher: input?.gitWatcher || (baseDir ? new GitWatcherService(baseDir) : null),
      code: input?.code
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
        'commit.RESOLVE_CONFLICT': {
          actions: 'resolveConflict'
        },
        'commit.MARK_RESOLVED': {
          actions: 'markResolved'
        },
        'commit.RESOLVE_ALL_CONFLICTS': {
          actions: 'resolveAllConflicts'
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
          actions: ['updateBaseDirectory', 'selfRefreshGitStatus', 'worktreeList', 'getAllBranches', 'logList']
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
        },
        'commit.WORKTREE_LIST': {
          actions: 'worktreeList'
        },
        'commit.WORKTREE_ADD': {
          actions: 'worktreeAdd'
        },
        'commit.WORKTREE_REMOVE': {
          actions: 'worktreeRemove'
        },
        'commit.LOG_LIST': {
          actions: 'logList'
        },
        'commit.REVERT_COMMIT': {
          actions: 'revertCommit'
        },
        'commit.RESET_TO_COMMIT': {
          actions: 'resetToCommit'
        }
      }
    }
  }
})