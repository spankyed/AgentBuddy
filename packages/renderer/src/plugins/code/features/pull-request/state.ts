import { setup, assign, enqueueActions } from 'xstate';
import { trpc } from '@/core/trpc';
import type { GitStatusFile, GitDiff } from '../commit/state';
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
  prFiles: GitStatusFile[]
  prBaseBranch: string
  prError: string | null
  isPrLoading: boolean
  selectedPrFile: GitStatusFile | null
  prDiff: GitDiff | null
}

export type Event =
  | { type: 'pr.REFRESH_STATUS' }
  | { type: 'pr.SELECT_FILE'; file: GitStatusFile }
  | { type: 'pr.VIEW_DIFF'; path: string }
  | { type: 'pr.ERROR'; message: string }
  | { type: 'pr.BASE_BRANCH_RECEIVED'; data: { branch: string } }
  | { type: 'pr.BRANCH_DIFF_RECEIVED'; data: { files: GitStatusFile[]; baseBranch: string } }
  | { type: 'pr.FILE_DIFF_RECEIVED'; data: GitDiff }
  | { type: 'pr.OPEN_FILE'; file: GitStatusFile }
  | { type: 'pr.STATUS_CHANGED'; data: { timestamp: Date } }
  | { type: 'CODE_STARTUP' };

export const pullRequestState = setup({
  types: {
    context: {} as Context,
    events: {} as Event
  },
  actions: {
    refreshPrStatus: ({ self }) => {
      // Check if we have a directory from parent context
      const parentContext = getParentContext(self)
      if (!parentContext?.baseDirectory) {
        // Send error event directly if no directory
        self.send({
          type: 'pr.ERROR',
          message: 'No directory selected. Please select a directory first.'
        })
        return
      }
      sendToBackend('pr.GET_BASE_BRANCH', {})
      sendToBackend('pr.GET_BRANCH_DIFF', {})
    },



    selectPrFile: assign({
      selectedPrFile: ({ event }) => {
        const ev = event as { type: 'pr.SELECT_FILE'; file: GitStatusFile }
        return ev.file
      }
    }),

    viewPrDiff: ({ event, context }) => {
      const ev = event as { type: 'pr.VIEW_DIFF'; path: string }
      sendToBackend('pr.GET_BRANCH_FILE_DIFF', {
        path: ev.path,
        baseBranch: context.prBaseBranch
      })
    },


    assignPrError: assign({
      prError: ({ event }) => {
        const ev = event as { type: 'pr.ERROR'; message: string }
        return ev.message
      },
      isPrLoading: false
    }),

    setPrLoading: assign({ isPrLoading: true }),

    handleBaseBranchReceived: assign({
      prBaseBranch: ({ event }) => {
        const ev = event as { type: 'pr.BASE_BRANCH_RECEIVED'; data: { branch: string } }
        return ev.data.branch
      },
      isPrLoading: false,
      prError: null
    }),

    handleBranchDiffReceived: assign({
      prFiles: ({ event }) => {
        const ev = event as { type: 'pr.BRANCH_DIFF_RECEIVED'; data: { files: GitStatusFile[]; baseBranch: string } }
        return ev.data.files
      },
      prBaseBranch: ({ event }) => {
        const ev = event as { type: 'pr.BRANCH_DIFF_RECEIVED'; data: { files: GitStatusFile[]; baseBranch: string } }
        return ev.data.baseBranch
      },
      isPrLoading: false
    }),


    handleFileDiffReceived: enqueueActions(({ enqueue, self, context, event }) => {
      const ev = event as { type: 'pr.FILE_DIFF_RECEIVED'; data: GitDiff }
      enqueue.assign({
        prDiff: ev.data
      })
      enqueue(() => {
        if (context.selectedPrFile) {
          const parentContext = getParentContext(self)
          const diffTabId = `pr-diff:${context.selectedPrFile.path}`;

          // Create diff tab
          const diffTab = {
            path: diffTabId,
            content: '',
            modified: false,
            isDiff: true,
            gitDiff: ev.data,
            gitFile: context.selectedPrFile
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

    openFile: ({ event, self, system }) => {
      const ev = event as { type: 'pr.OPEN_FILE'; file: GitStatusFile }
      const parentContext = getParentContext(self)
      const baseDirectory = parentContext?.baseDirectory || ''

      const fullPath = ev.file.path.startsWith('/')
        ? ev.file.path
        : baseDirectory.endsWith('/')
          ? baseDirectory + ev.file.path
          : baseDirectory + '/' + ev.file.path

      updateParentState(self, { selectedPanel: 'explorer' })

      system.get('explorer')?.send({
        type: 'explorer.OPEN_FILE',
        path: fullPath
      })
    },

    handleCodeStartup: ({ self }) => {
      // Check if we have a directory from parent context
      const parentContext = getParentContext(self)
      if (parentContext?.baseDirectory) {
        // Refresh PR status when directory is available
        self.send({ type: 'pr.REFRESH_STATUS' })
      } else {
        // Show error if no directory
        self.send({
          type: 'pr.ERROR',
          message: 'No directory selected. Please select a directory first.'
        })
      }
    }
  }
}).createMachine({
  id: 'pr',
  initial: 'idle',
  context: {
    prFiles: [],
    prBaseBranch: '',
    prError: null,
    isPrLoading: false,
    selectedPrFile: null,
    prDiff: null
  },
  states: {
    idle: {
      on: {
        'pr.REFRESH_STATUS': {
          actions: ['setPrLoading', 'refreshPrStatus']
        },
        'pr.SELECT_FILE': {
          actions: 'selectPrFile'
        },
        'pr.VIEW_DIFF': {
          actions: 'viewPrDiff'
        },
        'pr.OPEN_FILE': {
          actions: 'openFile'
        },
        'pr.ERROR': {
          actions: 'assignPrError'
        },
        'pr.BASE_BRANCH_RECEIVED': {
          actions: 'handleBaseBranchReceived'
        },
        'pr.BRANCH_DIFF_RECEIVED': {
          actions: 'handleBranchDiffReceived'
        },
        'pr.FILE_DIFF_RECEIVED': {
          actions: 'handleFileDiffReceived'
        },
        'pr.STATUS_CHANGED': {
          actions: 'refreshPrStatus'
        },
        'CODE_STARTUP': {
          actions: 'handleCodeStartup'
        }
      }
    }
  }
});
