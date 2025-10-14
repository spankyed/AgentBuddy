import { setup, assign, enqueueActions } from 'xstate';
import { trpc } from '@/core/trpc';
import { updateParentState, getParentContext } from '../../utils/parent-communication';
import { mergeTabs } from '../../utils/tab-management';

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
  | { type: 'commit.ERROR_RECEIVED'; data: { message: string } }
  | { type: 'commit.BRANCHES_RECEIVED'; data: { branches: string[] } }
  | { type: 'commit.BRANCH_CHECKOUT_SUCCESS'; data: { branchName: string } }
  | { type: 'commit.BRANCH_PUSHED'; data: { branchName: string } }
  | { type: 'commit.BRANCH_PULLED'; data: { branchName: string } }
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
      if (context.commitMessage.trim()) {
        sendToBackend('commit.COMMIT', { message: context.commitMessage })
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

      // Git paths are relative to the repository root
      // We need to construct the absolute path correctly
      let fullPath: string
      if (ev.file.path.startsWith('/')) {
        // Path is already absolute
        fullPath = ev.file.path
      } else {
        // For git files, the path is relative to the git repository root
        // which should be the same as our baseDirectory
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
      isPulling: false
    }),


    handleDiffReceived: enqueueActions(({ enqueue, self, context, event }) => {
      const ev = event as { type: 'commit.DIFF_RECEIVED'; data: GitDiff }
      enqueue.assign({
        gitDiff: ev.data
      })
      enqueue(() => {
        if (context.selectedGitFile) {
          const parentContext = getParentContext(self)
          const diffTabId = `diff:${context.selectedGitFile.path}:${context.selectedGitFile.staged ? 'staged' : 'unstaged'}`;

          // Create diff tab
          const diffTab = {
            path: diffTabId,
            content: '',
            modified: false,
            isDiff: true,
            gitDiff: ev.data,
            gitFile: context.selectedGitFile
          }

          const result = mergeTabs(
            parentContext?.openFiles || [],
            [diffTab],
            diffTabId // Set as active
          )

          updateParentState(self, result)
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
      }
    }
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
    hasUpstream: false,
    commitsAhead: 0,
    commitsBehind: 0,
    isPushing: false,
    isPulling: false
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
        'commit.FILE_REVERTED': {
          actions: ['handleFileReverted', 'refreshGitStatus']
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
        'CODE_STARTUP': {
          actions: 'handleCodeStartup'
        }
      }
    }
  }
});
