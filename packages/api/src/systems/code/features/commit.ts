import { assign, setup } from 'xstate'
import { emit } from '@/core/shared/actor-helpers'
import { rootEvents } from '@/core/router/bus-emitter'
import { GitRepository, StashConflictError } from '../services/git'
import { GitWatcherService } from '../services/gitwatcher'
import { GitStatusFile, GitDiff, StashEntry, WorktreeEntry, CommitLogEntry } from '../types'
import { requireGitRepository } from '../utils/git-helpers'
import { sendToBrainSystem } from '@/services/event-emitter'
import { repository } from '@/repository'

const pluginId = 'code' as const

// Incoming events from frontend
export type IncomingCommitEvents =
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
  | { type: 'commit.GENERATING_MESSAGE' }
  | { type: 'commit.MESSAGE_GENERATED'; data: { message: string } }
  | { type: 'commit.STASH_LIST_RECEIVED'; data: { stashes: StashEntry[] } }
  | { type: 'commit.STASH_SUCCESS'; data: { message: string } }
  | { type: 'commit.WORKTREE_LIST_RECEIVED'; data: { worktrees: WorktreeEntry[] } }
  | { type: 'commit.WORKTREE_ADDED'; data: { path: string; branch: string } }
  | { type: 'commit.WORKTREE_REMOVED'; data: { path: string } }
  | { type: 'commit.CONFLICT_RESOLVED'; data: { path: string } }
  | { type: 'commit.ALL_CONFLICTS_RESOLVED' }
  | { type: 'commit.LOG_LIST_RECEIVED'; data: { commits: CommitLogEntry[] } }
  | { type: 'commit.REVERT_COMMIT_SUCCESS'; data: { hash: string } }
  | { type: 'commit.RESET_COMMIT_SUCCESS'; data: { hash: string } }

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
        self.send({ type: 'commit.LOG_LIST' })
      }, 150)

      // Also notify the PR system to refresh if it exists
      const prSystem = system.get('pr')
      if (prSystem) {
        prSystem.send({ type: 'pr.GIT_STATUS_CHANGED' })
      }
    },

    getGitStatus: ({ context }) => {
      if (!requireGitRepository(context)) return

      context.gitRepository.isGitRepository().then((isGitRepo) => {
        if (!isGitRepo) {
          const wrapped = emit(pluginId, {
            type: 'commit.ERROR_RECEIVED',
            data: { message: 'Not a git repository' }
          })
          rootEvents.emitOutgoing(wrapped.event)
          return
        }

        return Promise.all([
          context.gitRepository!.getStatus(),
          context.gitRepository!.getCurrentBranch(),
          context.gitRepository!.isCurrentBranchPublished(),
          context.gitRepository!.getCommitsAheadBehind()
        ]).then(([status, branch, hasUpstream, commitsInfo]) => {
          const wrapped = emit(pluginId, {
            type: 'commit.STATUS_RECEIVED',
            data: { files: status, branch, hasUpstream, commitsAhead: commitsInfo.ahead, commitsBehind: commitsInfo.behind }
          })
          rootEvents.emitOutgoing(wrapped.event)
        })
      }).catch((error: any) => {
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

        const wrapped = emit(pluginId, {
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
        rootEvents.emitOutgoing(wrapped.event)
      }).catch((error: any) => {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      })
    },

    stageFiles: ({ event, context, self }) => {
      const ev = event as { type: 'commit.STAGE_FILES'; paths: string[] }

      if (!requireGitRepository(context)) return

      context.gitRepository.stageFiles(ev.paths).then(() => {
        const wrapped = emit(pluginId, {
          type: 'commit.FILES_STAGED',
          data: { paths: ev.paths }
        })
        rootEvents.emitOutgoing(wrapped.event)
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
      }).catch((error: any) => {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
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
        const wrapped = emit(pluginId, {
          type: 'commit.FILES_UNSTAGED',
          data: { paths: ev.paths }
        })
        rootEvents.emitOutgoing(wrapped.event)
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
      }).catch((error: any) => {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      })
    },

    revertFile: ({ event, context, self }) => {
      const ev = event as { type: 'commit.REVERT_FILE'; path: string }

      if (!requireGitRepository(context)) return

      context.gitRepository.revertFile(ev.path).then(() => {
        const wrapped = emit(pluginId, {
          type: 'commit.FILE_REVERTED',
          data: { path: ev.path }
        })
        rootEvents.emitOutgoing(wrapped.event)
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
        const fileChangeWrapped = emit(pluginId, {
          type: 'explorer.FILE_CHANGED_EXTERNALLY',
          data: {
            path: ev.path,
            changeType: 'change',
            modifiedAt: new Date()
          }
        })
        rootEvents.emitOutgoing(fileChangeWrapped.event)
      }).catch((error: any) => {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      })
    },

    revertFiles: ({ event, context, self }) => {
      const ev = event as { type: 'commit.REVERT_FILES'; paths: string[] }

      if (!requireGitRepository(context)) return

      context.gitRepository.revertFiles(ev.paths).then(() => {
        const wrapped = emit(pluginId, {
          type: 'commit.FILES_REVERTED',
          data: { paths: ev.paths }
        })
        rootEvents.emitOutgoing(wrapped.event)
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
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
      }).catch((error: any) => {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      })
    },

    resolveConflict: ({ event, context, self }) => {
      const ev = event as { type: 'commit.RESOLVE_CONFLICT'; path: string; strategy: 'ours' | 'theirs' }
      if (!requireGitRepository(context)) return

      context.gitRepository.resolveConflict(ev.path, ev.strategy).then(() => {
        const wrapped = emit(pluginId, {
          type: 'commit.CONFLICT_RESOLVED',
          data: { path: ev.path }
        })
        rootEvents.emitOutgoing(wrapped.event)
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
      }).catch((error: any) => {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      })
    },

    markResolved: ({ event, context, self }) => {
      const ev = event as { type: 'commit.MARK_RESOLVED'; path: string }
      if (!requireGitRepository(context)) return

      context.gitRepository.stageFiles([ev.path]).then(() => {
        const wrapped = emit(pluginId, {
          type: 'commit.CONFLICT_RESOLVED',
          data: { path: ev.path }
        })
        rootEvents.emitOutgoing(wrapped.event)
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
      }).catch((error: any) => {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
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
        const wrapped = emit(pluginId, { type: 'commit.ALL_CONFLICTS_RESOLVED' })
        rootEvents.emitOutgoing(wrapped.event)
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
      }).catch((error: any) => {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      })
    },

    commit: ({ event, context, self }) => {
      const ev = event as { type: 'commit.COMMIT'; message: string }

      if (!requireGitRepository(context)) return

      context.gitRepository.getStagedFiles().then((stagedFiles) => {
        if (stagedFiles.length === 0) {
          const wrapped = emit(pluginId, {
            type: 'commit.ERROR_RECEIVED',
            data: { message: 'No files staged for commit. Please stage files before committing.' }
          })
          rootEvents.emitOutgoing(wrapped.event)
          return
        }

        return context.gitRepository!.commit(ev.message).then(() => {
          const wrapped = emit(pluginId, {
            type: 'commit.COMMIT_SUCCESS',
            data: { message: ev.message }
          })
          rootEvents.emitOutgoing(wrapped.event)
          self.send({ type: 'commit.GIT_STATUS_CHANGED' })
        })
      }).catch((error: any) => {
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
      })
    },

    getCurrentBranch: ({ context }) => {
      if (!requireGitRepository(context)) return

      context.gitRepository.getCurrentBranch().then((branch) => {
        const wrapped = emit(pluginId, {
          type: 'commit.BRANCH_RETRIEVED',
          data: { branch }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }).catch((error: any) => {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      })
    },

    getAllBranches: ({ context }) => {
      if (!requireGitRepository(context)) return

      context.gitRepository.getAllBranches().then((branches) => {
        const wrapped = emit(pluginId, {
          type: 'commit.BRANCHES_RECEIVED',
          data: { branches }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }).catch((error: any) => {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      })
    },

    checkoutBranch: ({ event, context, self }) => {
      const ev = event as { type: 'commit.CHECKOUT_BRANCH'; branchName: string }

      if (!requireGitRepository(context)) return

      context.gitRepository.checkoutBranch(ev.branchName).then(() => {
        context.gitRepository!.clearCache()

        const wrapped = emit(pluginId, {
          type: 'commit.BRANCH_CHECKOUT_SUCCESS',
          data: { branchName: ev.branchName }
        })
        rootEvents.emitOutgoing(wrapped.event)

        self.send({ type: 'commit.GIT_STATUS_CHANGED' })

        const prSystem = self.system.get('pr')
        if (prSystem) {
          prSystem.send({ type: 'pr.GIT_STATUS_CHANGED' })
        }
      }).catch((error: any) => {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      })
    },

    pushBranch: ({ context, self }) => {
      if (!requireGitRepository(context)) return

      let branchName: string
      context.gitRepository.getCurrentBranch().then((currentBranch) => {
        branchName = currentBranch
        return context.gitRepository!.pushBranch()
      }).then(() => {
        const wrapped = emit(pluginId, {
          type: 'commit.BRANCH_PUSHED',
          data: { branchName }
        })
        rootEvents.emitOutgoing(wrapped.event)
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
      }).catch((error: any) => {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      })
    },

    generateCommitMessage: ({ context }) => {
      if (!requireGitRepository(context)) return

      context.gitRepository.getStagedFiles().then((stagedFiles) => {
        const staged = stagedFiles.length > 0
        return context.gitRepository!.getDiff(undefined, staged)
      }).then(async (diff) => {
        if (!diff.trim()) {
          const wrapped = emit(pluginId, {
            type: 'commit.ERROR_RECEIVED',
            data: { message: 'No changes found to generate a commit message from.' }
          })
          rootEvents.emitOutgoing(wrapped.event)
          return
        }

        const truncatedDiff = diff.length > 40000 ? diff.substring(0, 40000) + '\n... (truncated)' : diff

        const branch = await context.gitRepository!.getCurrentBranch()
        const repoDir = context.gitRepository!.getWorkingDir()
        const repoName = repoDir.split('/').pop() || ''

        const threadsSettings = repository.settingsQueries.getPluginSettings('threads') as any
        const provider = threadsSettings?.chat?.defaultMode || 'Claude Code'

        sendToBrainSystem({
          eventType: 'commit.generate',
          payload: { diff: truncatedDiff, branch, repoName, provider },
        })
      }).catch((error: any) => {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
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

        const wrapped = emit(pluginId, {
          type: 'commit.BRANCH_PULLED',
          data: { branchName }
        })
        rootEvents.emitOutgoing(wrapped.event)
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
      }).catch((error: any) => {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
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
        const wrapped = emit(pluginId, {
          type: 'commit.STASH_SUCCESS',
          data: { message: result }
        })
        rootEvents.emitOutgoing(wrapped.event)
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
        self.send({ type: 'commit.STASH_LIST' })
      }).catch((error: any) => {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      })
    },

    stashList: ({ context }) => {
      if (!requireGitRepository(context)) return

      context.gitRepository.stashList().then((stashes) => {
        const wrapped = emit(pluginId, {
          type: 'commit.STASH_LIST_RECEIVED',
          data: { stashes }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }).catch((error: any) => {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      })
    },

    stashApply: ({ event, context, self }) => {
      const ev = event as { type: 'commit.STASH_APPLY'; index: number }

      if (!requireGitRepository(context)) return

      context.gitRepository.stashApply(ev.index).then(() => {
        const wrapped = emit(pluginId, {
          type: 'commit.STASH_SUCCESS',
          data: { message: 'Stash applied successfully' }
        })
        rootEvents.emitOutgoing(wrapped.event)
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
      }).catch((error: any) => {
        if (error instanceof StashConflictError) {
          const wrapped = emit(pluginId, {
            type: 'commit.STASH_SUCCESS',
            data: { message: error.message }
          })
          rootEvents.emitOutgoing(wrapped.event)
          self.send({ type: 'commit.GIT_STATUS_CHANGED' })
          return
        }
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      })
    },

    stashPop: ({ event, context, self }) => {
      const ev = event as { type: 'commit.STASH_POP'; index: number }

      if (!requireGitRepository(context)) return

      context.gitRepository.stashPop(ev.index).then(() => {
        const wrapped = emit(pluginId, {
          type: 'commit.STASH_SUCCESS',
          data: { message: 'Stash popped successfully' }
        })
        rootEvents.emitOutgoing(wrapped.event)
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
        self.send({ type: 'commit.STASH_LIST' })
      }).catch((error: any) => {
        if (error instanceof StashConflictError) {
          const wrapped = emit(pluginId, {
            type: 'commit.STASH_SUCCESS',
            data: { message: error.message }
          })
          rootEvents.emitOutgoing(wrapped.event)
          self.send({ type: 'commit.GIT_STATUS_CHANGED' })
          self.send({ type: 'commit.STASH_LIST' })
          return
        }
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      })
    },

    stashDrop: ({ event, context, self }) => {
      const ev = event as { type: 'commit.STASH_DROP'; index: number }

      if (!requireGitRepository(context)) return

      context.gitRepository.stashDrop(ev.index).then(() => {
        self.send({ type: 'commit.STASH_LIST' })
      }).catch((error: any) => {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      })
    },

    stashClear: ({ context, self }) => {
      if (!requireGitRepository(context)) return

      context.gitRepository.stashClear().then(() => {
        self.send({ type: 'commit.STASH_LIST' })
      }).catch((error: any) => {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      })
    },

    logList: ({ context }) => {
      if (!requireGitRepository(context)) return

      context.gitRepository.gitLog().then((commits) => {
        const wrapped = emit(pluginId, {
          type: 'commit.LOG_LIST_RECEIVED',
          data: { commits }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }).catch((error: any) => {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      })
    },

    revertCommit: ({ event, context, self }) => {
      const ev = event as { type: 'commit.REVERT_COMMIT'; hash: string }

      if (!requireGitRepository(context)) return

      context.gitRepository.revertCommit(ev.hash).then(() => {
        const wrapped = emit(pluginId, {
          type: 'commit.REVERT_COMMIT_SUCCESS',
          data: { hash: ev.hash }
        })
        rootEvents.emitOutgoing(wrapped.event)
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
        self.send({ type: 'commit.LOG_LIST' })
      }).catch((error: any) => {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      })
    },

    resetToCommit: ({ event, context, self }) => {
      const ev = event as { type: 'commit.RESET_TO_COMMIT'; hash: string }

      if (!requireGitRepository(context)) return

      context.gitRepository.resetToCommit(ev.hash).then(() => {
        const wrapped = emit(pluginId, {
          type: 'commit.RESET_COMMIT_SUCCESS',
          data: { hash: ev.hash }
        })
        rootEvents.emitOutgoing(wrapped.event)
        self.send({ type: 'commit.GIT_STATUS_CHANGED' })
        self.send({ type: 'commit.LOG_LIST' })
      }).catch((error: any) => {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      })
    },

    worktreeList: ({ context }) => {
      if (!requireGitRepository(context)) return

      context.gitRepository.worktreeList().then((worktrees) => {
        const wrapped = emit(pluginId, {
          type: 'commit.WORKTREE_LIST_RECEIVED',
          data: { worktrees }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }).catch((error: any) => {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      })
    },

    worktreeAdd: ({ event, context, self }) => {
      if (!requireGitRepository(context)) return
      const ev = event as { type: 'commit.WORKTREE_ADD'; path: string; branch?: string; createBranch?: boolean }

      context.gitRepository.worktreeAdd(ev.path, ev.branch, ev.createBranch).then(() => {
        const wrapped = emit(pluginId, {
          type: 'commit.WORKTREE_ADDED',
          data: { path: ev.path, branch: ev.branch || '' }
        })
        rootEvents.emitOutgoing(wrapped.event)
        self.send({ type: 'commit.WORKTREE_LIST' })
      }).catch((error: any) => {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      })
    },

    worktreeRemove: ({ event, context, self }) => {
      if (!requireGitRepository(context)) return
      const ev = event as { type: 'commit.WORKTREE_REMOVE'; path: string; force?: boolean }

      context.gitRepository.worktreeRemove(ev.path, ev.force).then(() => {
        const wrapped = emit(pluginId, {
          type: 'commit.WORKTREE_REMOVED',
          data: { path: ev.path }
        })
        rootEvents.emitOutgoing(wrapped.event)
        self.send({ type: 'commit.WORKTREE_LIST' })
      }).catch((error: any) => {
        const wrapped = emit(pluginId, {
          type: 'commit.ERROR_RECEIVED',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
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