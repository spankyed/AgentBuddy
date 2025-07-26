import { setup, assign, enqueueActions } from 'xstate';
import { trpc } from '@/core/trpc';
import type { GitStatusFile, GitDiff } from '../../state';
import { updateParentState, getParentContext } from '../../utils/parent-communication';
import { mergeTabs } from '../../utils/tab-management';

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
  | { type: 'commit.STATUS_RECEIVED'; files: GitStatusFile[]; branch: string }
  | { type: 'commit.GIT_STATUS'; data: { files: GitStatusFile[]; branch: string } }
  | { type: 'commit.DIFF_RECEIVED'; diff: GitDiff }
  | { type: 'commit.GIT_DIFF'; data: GitDiff }
  | { type: 'commit.FILES_STAGED'; paths: string[] }
  | { type: 'commit.FILES_UNSTAGED'; paths: string[] }
  | { type: 'commit.COMMIT_SUCCESS'; message: string }
  | { type: 'commit.FILE_REVERTED'; path: string }
  | { type: 'commit.ERROR'; message: string }
  | { type: 'commit.GIT_ERROR'; data: { message: string } };

export const commitState = setup({
  types: {
    context: {} as Context,
    events: {} as Event
  },
  actions: {
    refreshGitStatus: () => {
      sendToBackend('commit.GET_GIT_STATUS', {})
    },
    
    assignGitStatus: assign({
      gitStatus: ({ event }) => {
        const ev = event as { type: 'commit.STATUS_RECEIVED'; files: GitStatusFile[]; branch: string }
        return ev.files
      },
      gitBranch: ({ event }) => {
        const ev = event as { type: 'commit.STATUS_RECEIVED'; files: GitStatusFile[]; branch: string }
        return ev.branch
      },
      isGitLoading: false,
      gitError: null
    }),
    
    assignGitError: assign({
      gitError: ({ event }) => {
        const ev = event as { type: 'commit.ERROR'; message: string }
        return ev.message
      },
      isGitLoading: false
    }),
    
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
    
    assignGitDiff: assign({
      gitDiff: ({ event }) => {
        const ev = event as { type: 'commit.DIFF_RECEIVED'; diff: GitDiff }
        return ev.diff
      }
    }),
    
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
    
    handleGitStatus: assign({
      gitStatus: ({ event }) => {
        const ev = event as { type: 'commit.GIT_STATUS'; data: { files: GitStatusFile[]; branch: string } }
        return ev.data.files
      },
      gitBranch: ({ event }) => {
        const ev = event as { type: 'commit.GIT_STATUS'; data: { files: GitStatusFile[]; branch: string } }
        return ev.data.branch
      },
      isGitLoading: false,
      gitError: null
    }),
    
    handleGitError: assign({
      gitError: ({ event }) => {
        const ev = event as { type: 'commit.GIT_ERROR'; data: { message: string } }
        return ev.data.message
      },
      isGitLoading: false
    }),
    
    handleDiffReceived: enqueueActions(({ enqueue, self, context, event }) => {
      enqueue('assignGitDiff')
      enqueue(() => {
        const ev = event as { type: 'commit.DIFF_RECEIVED'; diff: GitDiff }
        if (context.selectedGitFile) {
          const parentContext = getParentContext(self)
          const diffTabId = `diff:${context.selectedGitFile.path}:${context.selectedGitFile.staged ? 'staged' : 'unstaged'}`;
          
          // Create diff tab
          const diffTab = {
            path: diffTabId,
            content: '',
            modified: false,
            isDiff: true,
            gitDiff: ev.diff,
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
    
    handleGitDiff: enqueueActions(({ enqueue, self, context, event }) => {
      const ev = event as { type: 'commit.GIT_DIFF'; data: GitDiff }
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
    })
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
    revertDialogFile: null
  },
  states: {
    idle: {
      on: {
        'commit.REFRESH_STATUS': {
          actions: ['setGitLoading', 'refreshGitStatus']
        },
        'commit.STATUS_RECEIVED': {
          actions: 'assignGitStatus'
        },
        'commit.GIT_STATUS': {
          actions: 'handleGitStatus'
        },
        'commit.ERROR': {
          actions: 'assignGitError'
        },
        'commit.GIT_ERROR': {
          actions: 'handleGitError'
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
        'commit.GIT_DIFF': {
          actions: 'handleGitDiff'
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
        }
      }
    }
  }
});