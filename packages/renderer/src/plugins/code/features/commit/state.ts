import { setup, assign, enqueueActions } from 'xstate';
import { trpc } from '@/core/trpc';
import { updateParentState, getParentContext, addTabToParent } from '../../utils/parent-communication';


// Git types
export interface GitStatusFile {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'copied' | 'typechange' | 'unmerged'
  staged: boolean
  originalPath?: string // For renames and copies
  score?: number // Rename/copy similarity score (0-100)
}

export interface GitDiff {
  path: string
  diff: string
  staged: boolean
  originalContent?: string
  modifiedContent?: string
  isImage?: boolean
}

const sendToBackend = (type: string, data: any) => {
  trpc.bus.send.mutate({
    systemId: 'code' as any,
    type: type as any,
    ...data
  } as any)
}

export interface Context {
  gitStatus: GitStatusFile[]
  gitBranch: string
  gitError: string | null
  isGitLoading: boolean
  selectedGitFile: GitStatusFile | null
  gitDiff: GitDiff | null
  commitMessage: string
  revertDialogFile: GitStatusFile | null
  availableBranches: string[]
  branchInput: string
  isCheckingOutBranch: boolean
  hasUpstream: boolean
  commitsAhead: number
  commitsBehind: number
  isPushing: boolean
  isPulling: boolean
  isGeneratingMessage: boolean
  stashList: StashEntry[]
  isStashing: boolean
  worktreeList: WorktreeEntry[]
  isWorktreeLoading: boolean
}

export interface StashEntry {
  index: number
  ref: string
  message: string
  date: string
}

export interface WorktreeEntry {
  path: string
  head: string
  branch: string
  isBare: boolean
  isCurrent: boolean
  isMain: boolean
  isLocked: boolean
  lockedReason?: string
}

export type Event =
  | { type: 'commit.REFRESH_STATUS' }
  | { type: 'commit.SELECT_FILE'; file: GitStatusFile }
  | { type: 'commit.STAGE_FILES'; paths: string[] }
  | { type: 'commit.UNSTAGE_FILES'; paths: string[] }
  | { type: 'commit.UPDATE_MESSAGE'; message: string }
  | { type: 'commit.COMMIT' }
  | { type: 'commit.VIEW_DIFF'; path: string; staged: boolean }
  | { type: 'commit.CLEAR_DIFF' }
  | { type: 'commit.REVERT_FILE'; path: string }
  | { type: 'commit.REVERT_FILES'; paths: string[] }
  | { type: 'commit.TOGGLE_REVERT_DIALOG'; file?: GitStatusFile }
  | { type: 'commit.OPEN_FILE'; file: GitStatusFile }
  | { type: 'commit.GET_ALL_BRANCHES' }
  | { type: 'commit.UPDATE_BRANCH_INPUT'; input: string }
  | { type: 'commit.CHECKOUT_BRANCH' }
  | { type: 'commit.PUSH_BRANCH' }
  | { type: 'commit.PULL_BRANCH' }
  | { type: 'commit.STATUS_RECEIVED'; data: { files: GitStatusFile[]; branch: string; hasUpstream: boolean; commitsAhead: number; commitsBehind: number } }
  | { type: 'commit.DIFF_RECEIVED'; data: GitDiff }
  | { type: 'commit.FILES_STAGED'; paths: string[] }
  | { type: 'commit.FILES_UNSTAGED'; paths: string[] }
  | { type: 'commit.COMMIT_SUCCESS'; message: string }
  | { type: 'commit.FILE_REVERTED'; path: string }
  | { type: 'commit.FILES_REVERTED'; paths: string[] }
  | { type: 'commit.ERROR_RECEIVED'; data: { message: string } }
  | { type: 'commit.BRANCHES_RECEIVED'; data: { branches: string[] } }
  | { type: 'commit.BRANCH_CHECKOUT_SUCCESS'; data: { branchName: string } }
  | { type: 'commit.BRANCH_PUSHED'; data: { branchName: string } }
  | { type: 'commit.BRANCH_PULLED'; data: { branchName: string } }
  | { type: 'commit.DISMISS_ERROR' }
  | { type: 'commit.GENERATE_MESSAGE' }
  | { type: 'commit.GENERATING_MESSAGE' }
  | { type: 'commit.MESSAGE_GENERATED'; data: { message: string } }
  | { type: 'commit.STASH_PUSH'; message?: string; stagedOnly?: boolean }
  | { type: 'commit.STASH_LIST' }
  | { type: 'commit.STASH_APPLY'; index: number }
  | { type: 'commit.STASH_POP'; index: number }
  | { type: 'commit.STASH_DROP'; index: number }
  | { type: 'commit.STASH_CLEAR' }
  | { type: 'commit.STASH_LIST_RECEIVED'; data: { stashes: StashEntry[] } }
  | { type: 'commit.STASH_SUCCESS'; data: { message: string } }
  | { type: 'commit.WORKTREE_LIST' }
  | { type: 'commit.WORKTREE_ADD'; path: string; branch?: string; createBranch?: boolean }
  | { type: 'commit.WORKTREE_REMOVE'; path: string; force?: boolean }
  | { type: 'commit.WORKTREE_SWITCH'; path: string }
  | { type: 'commit.WORKTREE_LIST_RECEIVED'; data: { worktrees: WorktreeEntry[] } }
  | { type: 'commit.WORKTREE_ADDED'; data: { path: string; branch: string } }
  | { type: 'commit.WORKTREE_REMOVED'; data: { path: string } }
  | { type: 'commit.RESOLVE_CONFLICT'; path: string; strategy: 'ours' | 'theirs' }
  | { type: 'commit.MARK_RESOLVED'; path: string }
  | { type: 'commit.RESOLVE_ALL_CONFLICTS'; strategy: 'ours' | 'theirs' }
  | { type: 'commit.CONFLICT_RESOLVED'; path: string }
  | { type: 'commit.ALL_CONFLICTS_RESOLVED' }
  | { type: 'CODE_STARTUP' };

export const commitState = setup({
  types: {
    context: {} as Context,
    events: {} as Event
  },
  actions: {
    refreshGitStatus: () => {
      sendToBackend('commit.GET_GIT_STATUS', {})
    },



    selectGitFile: assign({
      selectedGitFile: ({ event }) => {
        const ev = event as { type: 'commit.SELECT_FILE'; file: GitStatusFile }
        return ev.file
      }
    }),

    stageFiles: ({ event }) => {
      const ev = event as { type: 'commit.STAGE_FILES'; paths: string[] }
      sendToBackend('commit.STAGE_FILES', { paths: ev.paths })
    },

    unstageFiles: ({ event }) => {
      const ev = event as { type: 'commit.UNSTAGE_FILES'; paths: string[] }
      sendToBackend('commit.UNSTAGE_FILES', { paths: ev.paths })
    },


    viewDiff: ({ event }) => {
      const ev = event as { type: 'commit.VIEW_DIFF'; path: string; staged: boolean }
      sendToBackend('commit.GET_GIT_DIFF', { path: ev.path, staged: ev.staged })
    },

    updateCommitMessage: assign({
      commitMessage: ({ event }) => {
        const ev = event as { type: 'commit.UPDATE_MESSAGE'; message: string }
        return ev.message
      }
    }),

    commit: ({ context }) => {
      const message = context.commitMessage.replace(/\n*Co-Authored-By:.*$/gim, '').trim()
      if (message) {
        sendToBackend('commit.COMMIT', { message })
      }
    },

    handleCommitSuccess: assign({
      commitMessage: '',
      selectedGitFile: null,
      gitDiff: null
    }),

    toggleRevertDialog: assign({
      revertDialogFile: ({ event }) => {
        const ev = event as { type: 'commit.TOGGLE_REVERT_DIALOG'; file?: GitStatusFile }
        return ev.file || null
      }
    }),

    revertFile: ({ context }) => {
      if (context.revertDialogFile) {
        sendToBackend('commit.REVERT_FILE', { path: context.revertDialogFile.path })
      }
    },

    revertFiles: ({ event }) => {
      const ev = event as { type: 'commit.REVERT_FILES'; paths: string[] }
      sendToBackend('commit.REVERT_FILES', { paths: ev.paths })
    },

    resolveConflict: ({ event }) => {
      const ev = event as { type: 'commit.RESOLVE_CONFLICT'; path: string; strategy: 'ours' | 'theirs' }
      sendToBackend('commit.RESOLVE_CONFLICT', { path: ev.path, strategy: ev.strategy })
    },

    markResolved: ({ event }) => {
      const ev = event as { type: 'commit.MARK_RESOLVED'; path: string }
      sendToBackend('commit.MARK_RESOLVED', { path: ev.path })
    },

    resolveAllConflicts: ({ event }) => {
      const ev = event as { type: 'commit.RESOLVE_ALL_CONFLICTS'; strategy: 'ours' | 'theirs' }
      sendToBackend('commit.RESOLVE_ALL_CONFLICTS', { strategy: ev.strategy })
    },

    handleFileReverted: assign({
      revertDialogFile: null
    }),

    setGitLoading: assign({ isGitLoading: true }),

    clearGitDiff: assign({
      selectedGitFile: null,
      gitDiff: null
    }),

    openFile: ({ event, self, system }) => {
      const ev = event as { type: 'commit.OPEN_FILE'; file: GitStatusFile }
      const parentContext = getParentContext(self)
      const baseDirectory = parentContext?.baseDirectory || ''

      // For deleted files, show a deleted file view instead of trying to open
      if (ev.file.status === 'deleted') {
        const deletedTab = {
          path: `deleted:${ev.file.path}`,
          content: '',
          modified: false,
          isDeleted: true,
          deletedFilePath: ev.file.path,
        }
        addTabToParent(self, deletedTab)
        return
      }

      // Git paths are relative to the repository root
      // We need to construct the absolute path correctly
      let fullPath: string
      if (ev.file.path.startsWith('/')) {
        fullPath = ev.file.path
      } else {
        fullPath = baseDirectory.endsWith('/')
          ? baseDirectory + ev.file.path
          : baseDirectory + '/' + ev.file.path
      }

      // Send events to parent to switch to explorer panel and open file
      updateParentState(self, { selectedPanel: 'explorer' })

      system.get('explorer')?.send({
        type: 'explorer.OPEN_FILE',
        path: fullPath
      })
    },

    handleStatusReceived: assign({
      gitStatus: ({ event }) => {
        const ev = event as { type: 'commit.STATUS_RECEIVED'; data: { files: GitStatusFile[]; branch: string; hasUpstream: boolean; commitsAhead: number; commitsBehind: number } }
        return ev.data.files
      },
      gitBranch: ({ event }) => {
        const ev = event as { type: 'commit.STATUS_RECEIVED'; data: { files: GitStatusFile[]; branch: string; hasUpstream: boolean; commitsAhead: number; commitsBehind: number } }
        return ev.data.branch
      },
      hasUpstream: ({ event }) => {
        const ev = event as { type: 'commit.STATUS_RECEIVED'; data: { files: GitStatusFile[]; branch: string; hasUpstream: boolean; commitsAhead: number; commitsBehind: number } }
        return ev.data.hasUpstream
      },
      commitsAhead: ({ event }) => {
        const ev = event as { type: 'commit.STATUS_RECEIVED'; data: { files: GitStatusFile[]; branch: string; hasUpstream: boolean; commitsAhead: number; commitsBehind: number } }
        return ev.data.commitsAhead
      },
      commitsBehind: ({ event }) => {
        const ev = event as { type: 'commit.STATUS_RECEIVED'; data: { files: GitStatusFile[]; branch: string; hasUpstream: boolean; commitsAhead: number; commitsBehind: number } }
        return ev.data.commitsBehind
      },
      isGitLoading: false,
      gitError: null
    }),

    handleErrorReceived: assign({
      gitError: ({ event }) => {
        const ev = event as { type: 'commit.ERROR_RECEIVED'; data: { message: string } }
        return ev.data.message
      },
      isGitLoading: false,
      isCheckingOutBranch: false,
      isPushing: false,
      isPulling: false,
      isGeneratingMessage: false
    }),

    dismissError: assign({ gitError: null }),

    requestGenerateMessage: () => {
      sendToBackend('commit.GENERATE_MESSAGE', {})
    },

    setGeneratingMessage: assign({ isGeneratingMessage: true }),

    handleMessageGenerated: assign({
      commitMessage: ({ event }) => {
        const ev = event as { type: 'commit.MESSAGE_GENERATED'; data: { message: string } }
        return ev.data.message
      },
      isGeneratingMessage: false
    }),


    handleDiffReceived: enqueueActions(({ enqueue, self, context, event }) => {
      const ev = event as { type: 'commit.DIFF_RECEIVED'; data: GitDiff }
      enqueue.assign({
        gitDiff: ev.data
      })
      enqueue(() => {
        if (context.selectedGitFile) {
          const diffTabId = `diff:${context.selectedGitFile.path}:${context.selectedGitFile.staged ? 'staged' : 'unstaged'}`;
          const diffTab = {
            path: diffTabId,
            content: '',
            modified: false,
            isDiff: true,
            gitDiff: ev.data,
            gitFile: context.selectedGitFile
          }
          addTabToParent(self, diffTab)
        }
      })
    }),

    getAllBranches: () => {
      sendToBackend('commit.GET_ALL_BRANCHES', {})
    },

    updateBranchInput: assign({
      branchInput: ({ event }) => {
        const ev = event as { type: 'commit.UPDATE_BRANCH_INPUT'; input: string }
        return ev.input
      }
    }),

    checkoutBranch: ({ context }) => {
      if (context.branchInput.trim()) {
        sendToBackend('commit.CHECKOUT_BRANCH', { branchName: context.branchInput.trim() })
      }
    },

    setCheckingOutBranch: assign({ isCheckingOutBranch: true }),

    handleBranchesReceived: assign({
      availableBranches: ({ event }) => {
        const ev = event as { type: 'commit.BRANCHES_RECEIVED'; data: { branches: string[] } }
        return ev.data.branches
      }
    }),

    handleBranchCheckoutSuccess: assign({
      branchInput: '',
      isCheckingOutBranch: false
    }),

    pushBranch: () => {
      sendToBackend('commit.PUBLISH_BRANCH', {})
    },

    setPushing: assign({ isPushing: true }),

    handleBranchPushed: assign({
      isPushing: false
    }),

    pullBranch: () => {
      sendToBackend('commit.PULL_BRANCH', {})
    },

    setPulling: assign({ isPulling: true }),

    handleBranchPulled: assign({
      isPulling: false
    }),

    handleCodeStartup: ({ self }) => {
      // Check if we have a directory from parent context
      const parentContext = getParentContext(self)
      if (parentContext?.baseDirectory) {
        // Refresh git status when directory is available
        self.send({ type: 'commit.REFRESH_STATUS' })
        sendToBackend('commit.STASH_LIST', {})
        sendToBackend('commit.WORKTREE_LIST', {})
      }
    },

    stashPush: ({ event, context }) => {
      const ev = event as { type: 'commit.STASH_PUSH'; message?: string; stagedOnly?: boolean }
      sendToBackend('commit.STASH_PUSH', { message: ev.message, stagedOnly: ev.stagedOnly })
    },

    setStashing: assign({ isStashing: true }),

    requestStashList: () => {
      sendToBackend('commit.STASH_LIST', {})
    },

    handleStashListReceived: assign({
      stashList: ({ event }) => {
        const ev = event as { type: 'commit.STASH_LIST_RECEIVED'; data: { stashes: StashEntry[] } }
        return ev.data.stashes
      }
    }),

    handleStashSuccess: assign({
      isStashing: false,
      commitMessage: ''
    }),

    stashApply: ({ event }) => {
      const ev = event as { type: 'commit.STASH_APPLY'; index: number }
      sendToBackend('commit.STASH_APPLY', { index: ev.index })
    },

    stashPop: ({ event }) => {
      const ev = event as { type: 'commit.STASH_POP'; index: number }
      sendToBackend('commit.STASH_POP', { index: ev.index })
    },

    stashDrop: ({ event }) => {
      const ev = event as { type: 'commit.STASH_DROP'; index: number }
      sendToBackend('commit.STASH_DROP', { index: ev.index })
    },

    stashClear: () => {
      sendToBackend('commit.STASH_CLEAR', {})
    },

    requestWorktreeList: () => {
      sendToBackend('commit.WORKTREE_LIST', {})
    },

    handleWorktreeListReceived: assign({
      worktreeList: ({ event }) => {
        const ev = event as { type: 'commit.WORKTREE_LIST_RECEIVED'; data: { worktrees: WorktreeEntry[] } }
        return ev.data.worktrees
      },
      isWorktreeLoading: false
    }),

    worktreeAdd: ({ event }) => {
      const ev = event as { type: 'commit.WORKTREE_ADD'; path: string; branch?: string; createBranch?: boolean }
      sendToBackend('commit.WORKTREE_ADD', { path: ev.path, branch: ev.branch, createBranch: ev.createBranch })
    },

    worktreeRemove: ({ event }) => {
      const ev = event as { type: 'commit.WORKTREE_REMOVE'; path: string; force?: boolean }
      sendToBackend('commit.WORKTREE_REMOVE', { path: ev.path, force: ev.force })
    },

    worktreeSwitch: ({ event }) => {
      const ev = event as { type: 'commit.WORKTREE_SWITCH'; path: string }
      sendToBackend('commit.WORKTREE_SWITCH', { path: ev.path })
    },

    setWorktreeLoading: assign({ isWorktreeLoading: true }),

    handleWorktreeAdded: assign({ isWorktreeLoading: false }),

    handleWorktreeRemoved: assign({ isWorktreeLoading: false })
  }
}).createMachine({
  id: 'commit',
  initial: 'idle',
  context: {
    gitStatus: [],
    gitBranch: '',
    gitError: null,
    isGitLoading: false,
    selectedGitFile: null,
    gitDiff: null,
    commitMessage: '',
    revertDialogFile: null,
    availableBranches: [],
    branchInput: '',
    isCheckingOutBranch: false,
    hasUpstream: true,
    commitsAhead: 0,
    commitsBehind: 0,
    isPushing: false,
    isPulling: false,
    isGeneratingMessage: false,
    stashList: [],
    isStashing: false,
    worktreeList: [],
    isWorktreeLoading: false
  },
  states: {
    idle: {
      on: {
        'commit.REFRESH_STATUS': {
          actions: ['setGitLoading', 'refreshGitStatus']
        },
        'commit.STATUS_RECEIVED': {
          actions: 'handleStatusReceived'
        },
        'commit.ERROR_RECEIVED': {
          actions: 'handleErrorReceived'
        },
        'commit.DISMISS_ERROR': {
          actions: 'dismissError'
        },
        'commit.SELECT_FILE': {
          actions: 'selectGitFile'
        },
        'commit.STAGE_FILES': {
          actions: 'stageFiles'
        },
        'commit.UNSTAGE_FILES': {
          actions: 'unstageFiles'
        },
        'commit.FILES_STAGED': {
          actions: 'refreshGitStatus'
        },
        'commit.FILES_UNSTAGED': {
          actions: 'refreshGitStatus'
        },
        'commit.VIEW_DIFF': {
          actions: 'viewDiff'
        },
        'commit.DIFF_RECEIVED': {
          actions: 'handleDiffReceived'
        },
        'commit.UPDATE_MESSAGE': {
          actions: 'updateCommitMessage'
        },
        'commit.COMMIT': {
          actions: 'commit'
        },
        'commit.COMMIT_SUCCESS': {
          actions: ['handleCommitSuccess', 'refreshGitStatus']
        },
        'commit.TOGGLE_REVERT_DIALOG': {
          actions: 'toggleRevertDialog'
        },
        'commit.REVERT_FILE': {
          actions: ['revertFile', 'toggleRevertDialog']
        },
        'commit.REVERT_FILES': {
          actions: 'revertFiles'
        },
        'commit.FILE_REVERTED': {
          actions: ['handleFileReverted', 'refreshGitStatus']
        },
        'commit.FILES_REVERTED': {
          actions: 'refreshGitStatus'
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
        'commit.CONFLICT_RESOLVED': {
          actions: 'refreshGitStatus'
        },
        'commit.ALL_CONFLICTS_RESOLVED': {
          actions: 'refreshGitStatus'
        },
        'commit.CLEAR_DIFF': {
          actions: 'clearGitDiff'
        },
        'commit.OPEN_FILE': {
          actions: 'openFile'
        },
        'commit.GET_ALL_BRANCHES': {
          actions: 'getAllBranches'
        },
        'commit.UPDATE_BRANCH_INPUT': {
          actions: 'updateBranchInput'
        },
        'commit.CHECKOUT_BRANCH': {
          actions: ['setCheckingOutBranch', 'checkoutBranch']
        },
        'commit.BRANCHES_RECEIVED': {
          actions: 'handleBranchesReceived'
        },
        'commit.BRANCH_CHECKOUT_SUCCESS': {
          actions: ['handleBranchCheckoutSuccess', 'getAllBranches']
        },
        'commit.PUSH_BRANCH': {
          actions: ['setPushing', 'pushBranch']
        },
        'commit.BRANCH_PUSHED': {
          actions: 'handleBranchPushed'
        },
        'commit.PULL_BRANCH': {
          actions: ['setPulling', 'pullBranch']
        },
        'commit.BRANCH_PULLED': {
          actions: 'handleBranchPulled'
        },
        'commit.GENERATE_MESSAGE': {
          actions: 'requestGenerateMessage'
        },
        'commit.GENERATING_MESSAGE': {
          actions: 'setGeneratingMessage'
        },
        'commit.MESSAGE_GENERATED': {
          actions: 'handleMessageGenerated'
        },
        'commit.STASH_PUSH': {
          actions: ['setStashing', 'stashPush']
        },
        'commit.STASH_LIST': {
          actions: 'requestStashList'
        },
        'commit.STASH_LIST_RECEIVED': {
          actions: 'handleStashListReceived'
        },
        'commit.STASH_SUCCESS': {
          actions: ['handleStashSuccess', 'refreshGitStatus']
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
          actions: 'requestWorktreeList'
        },
        'commit.WORKTREE_LIST_RECEIVED': {
          actions: 'handleWorktreeListReceived'
        },
        'commit.WORKTREE_ADD': {
          actions: ['setWorktreeLoading', 'worktreeAdd']
        },
        'commit.WORKTREE_REMOVE': {
          actions: ['setWorktreeLoading', 'worktreeRemove']
        },
        'commit.WORKTREE_SWITCH': {
          actions: ['setWorktreeLoading', 'worktreeSwitch']
        },
        'commit.WORKTREE_ADDED': {
          actions: ['handleWorktreeAdded', 'requestWorktreeList']
        },
        'commit.WORKTREE_REMOVED': {
          actions: ['handleWorktreeRemoved', 'requestWorktreeList']
        },
        'CODE_STARTUP': {
          actions: 'handleCodeStartup'
        }
      }
    }
  }
});
