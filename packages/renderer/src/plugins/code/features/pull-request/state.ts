import { setup, assign, enqueueActions } from 'xstate';
import { trpc } from '@/core/trpc';
import type { GitStatusFile, GitDiff } from '../commit/state';
import type { GhPullRequest, GhPRComment } from '@app/api';
import { updateParentState, getParentContext } from '../../utils/parent-communication';
import { mergeTabs } from '../../utils/tab-management';

export type { GhPullRequest, GhPRComment }

const sendToBackend = (type: string, data: any) => {
  trpc.bus.send.mutate({
    systemId: 'code' as any,
    type: type as any,
    ...data
  } as any)
}

const defaultLoadingStates = {
  isPrLoading: false,
  isCreating: false,
  isMerging: false,
  isClosing: false,
  isTogglingDraft: false,
  isLoadingDetails: false,
  isLoadingPRs: false,
}

export interface Context {
  // Existing
  prFiles: GitStatusFile[]
  prBaseBranch: string
  prError: string | null
  isPrLoading: boolean
  selectedPrFile: GitStatusFile | null
  prDiff: GitDiff | null

  // GitHub PR state
  openPRs: GhPullRequest[]
  selectedPR: GhPullRequest | null
  branchPR: GhPullRequest | null
  prComments: GhPRComment[]
  viewMode: 'comparison' | 'info'
  panelMode: 'existing' | 'create'
  isGhAvailable: boolean

  // Create form
  createTitle: string
  createBody: string
  createBaseBranch: string
  createDraft: boolean

  // Loading states
  isLoadingPRs: boolean
  isCreating: boolean
  isMerging: boolean
  isClosing: boolean
  isTogglingDraft: boolean
  isLoadingDetails: boolean
}

export type Event =
  // Existing
  | { type: 'pr.REFRESH_STATUS' }
  | { type: 'pr.SELECT_FILE'; file: GitStatusFile }
  | { type: 'pr.VIEW_DIFF'; path: string }
  | { type: 'pr.ERROR'; message: string }
  | { type: 'pr.BASE_BRANCH_RECEIVED'; data: { branch: string } }
  | { type: 'pr.BRANCH_DIFF_RECEIVED'; data: { files: GitStatusFile[]; baseBranch: string } }
  | { type: 'pr.FILE_DIFF_RECEIVED'; data: GitDiff }
  | { type: 'pr.OPEN_FILE'; file: GitStatusFile }
  | { type: 'pr.STATUS_CHANGED'; data: { timestamp: Date } }
  | { type: 'CODE_STARTUP' }
  // GitHub PR events from backend
  | { type: 'pr.GH_AUTH_CHECKED'; data: { available: boolean } }
  | { type: 'pr.OPEN_PRS_RECEIVED'; data: { prs: GhPullRequest[] } }
  | { type: 'pr.PR_DETAILS_RECEIVED'; data: { pr: GhPullRequest; comments: GhPRComment[] } }
  | { type: 'pr.PR_CREATED'; data: { pr: GhPullRequest } }
  | { type: 'pr.PR_MERGED'; data: { number: number } }
  | { type: 'pr.PR_CLOSED'; data: { number: number } }
  | { type: 'pr.PR_DRAFT_TOGGLED'; data: { number: number; isDraft: boolean } }
  | { type: 'pr.BRANCH_PR_CHECKED'; data: { pr: GhPullRequest | null } }
  // User actions
  | { type: 'pr.LIST_PRS' }
  | { type: 'pr.SELECT_PR_BY_NUMBER'; number: number }
  | { type: 'pr.SWITCH_TO_PR_BRANCH'; branchName: string }
  | { type: 'pr.SET_VIEW_MODE'; mode: 'comparison' | 'info' }
  | { type: 'pr.SHOW_CREATE_FORM' }
  | { type: 'pr.CANCEL_CREATE' }
  | { type: 'pr.UPDATE_CREATE_FIELD'; field: string; value: any }
  | { type: 'pr.SUBMIT_CREATE' }
  | { type: 'pr.MERGE'; method?: 'merge' | 'squash' | 'rebase' }
  | { type: 'pr.CLOSE' }
  | { type: 'pr.TOGGLE_DRAFT' };

export const pullRequestState = setup({
  types: {
    context: {} as Context,
    events: {} as Event
  },
  actions: {
    refreshPrStatus: ({ self }) => {
      const parentContext = getParentContext(self)
      if (!parentContext?.baseDirectory) {
        self.send({ type: 'pr.ERROR', message: 'No directory selected. Please select a directory first.' })
        return
      }
      sendToBackend('pr.GET_BASE_BRANCH', {})
      sendToBackend('pr.GET_BRANCH_DIFF', {})
      sendToBackend('pr.CHECK_GH_AUTH', {})
      sendToBackend('pr.LIST_OPEN_PRS', {})
      sendToBackend('pr.CHECK_BRANCH_PR', {})
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
      ...defaultLoadingStates,
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
      enqueue.assign({ prDiff: ev.data })
      enqueue(() => {
        if (context.selectedPrFile) {
          const parentContext = getParentContext(self)
          const diffTabId = `pr-diff:${context.selectedPrFile.path}`;
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
            diffTabId
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
      const parentContext = getParentContext(self)
      if (parentContext?.baseDirectory) {
        self.send({ type: 'pr.REFRESH_STATUS' })
      } else {
        self.send({ type: 'pr.ERROR', message: 'No directory selected. Please select a directory first.' })
      }
    },

    // --- GitHub PR actions ---

    handleGhAuthChecked: assign({
      isGhAvailable: ({ event }) => {
        const ev = event as { type: 'pr.GH_AUTH_CHECKED'; data: { available: boolean } }
        return ev.data.available
      }
    }),

    handleOpenPRsReceived: assign({
      openPRs: ({ event }) => {
        const ev = event as { type: 'pr.OPEN_PRS_RECEIVED'; data: { prs: GhPullRequest[] } }
        return ev.data.prs
      },
      isLoadingPRs: false
    }),

    handlePRDetailsReceived: assign({
      selectedPR: ({ event }) => {
        const ev = event as { type: 'pr.PR_DETAILS_RECEIVED'; data: { pr: GhPullRequest; comments: GhPRComment[] } }
        return ev.data.pr
      },
      prComments: ({ event }) => {
        const ev = event as { type: 'pr.PR_DETAILS_RECEIVED'; data: { pr: GhPullRequest; comments: GhPRComment[] } }
        return ev.data.comments
      },
      isLoadingDetails: false
    }),

    handleBranchPRChecked: assign({
      branchPR: ({ event }) => {
        const ev = event as { type: 'pr.BRANCH_PR_CHECKED'; data: { pr: GhPullRequest | null } }
        return ev.data.pr
      },
      selectedPR: ({ event, context }) => {
        const ev = event as { type: 'pr.BRANCH_PR_CHECKED'; data: { pr: GhPullRequest | null } }
        // Auto-select the branch PR if no PR is currently selected
        if (ev.data.pr && !context.selectedPR) return ev.data.pr
        return context.selectedPR
      },
      panelMode: ({ event, context }) => {
        const ev = event as { type: 'pr.BRANCH_PR_CHECKED'; data: { pr: GhPullRequest | null } }
        // Only auto-switch to create if no PR is selected at all
        if (!ev.data.pr && !context.selectedPR) return 'create' as const
        return context.panelMode
      }
    }),

    handlePRCreated: assign({
      selectedPR: ({ event }) => {
        const ev = event as { type: 'pr.PR_CREATED'; data: { pr: GhPullRequest } }
        return ev.data.pr
      },
      panelMode: 'existing' as const,
      isCreating: false,
      createTitle: '',
      createBody: '',
      createDraft: false,
    }),

    handlePRMerged: assign({
      selectedPR: null,
      isMerging: false,
      panelMode: 'create' as const,
    }),

    handlePRClosed: assign({
      selectedPR: null,
      isClosing: false,
      panelMode: 'create' as const,
    }),

    handlePRDraftToggled: assign({
      selectedPR: ({ event, context }) => {
        const ev = event as { type: 'pr.PR_DRAFT_TOGGLED'; data: { number: number; isDraft: boolean } }
        if (context.selectedPR?.number === ev.data.number) {
          return { ...context.selectedPR, isDraft: ev.data.isDraft }
        }
        return context.selectedPR
      },
      isTogglingDraft: false,
    }),

    // User-initiated actions
    requestListPRs: ({ }) => {
      sendToBackend('pr.LIST_OPEN_PRS', {})
    },

    switchToPRBranch: ({ event }) => {
      const ev = event as { type: 'pr.SWITCH_TO_PR_BRANCH'; branchName: string }
      // Send directly to backend (the commit FE machine uses context.branchInput, not event data)
      sendToBackend('commit.CHECKOUT_BRANCH', { branchName: ev.branchName })
    },

    setViewMode: assign({
      viewMode: ({ event }) => {
        const ev = event as { type: 'pr.SET_VIEW_MODE'; mode: 'comparison' | 'info' }
        return ev.mode
      }
    }),

    showCreateForm: assign({
      panelMode: 'create' as const,
      selectedPR: null,
    }),

    cancelCreate: assign({
      panelMode: ({ context }) => context.branchPR ? 'existing' as const : 'create' as const,
      selectedPR: ({ context }) => context.branchPR,
    }),

    updateCreateField: assign({
      createTitle: ({ event, context }) => {
        const ev = event as { type: 'pr.UPDATE_CREATE_FIELD'; field: string; value: any }
        return ev.field === 'title' ? ev.value : context.createTitle
      },
      createBody: ({ event, context }) => {
        const ev = event as { type: 'pr.UPDATE_CREATE_FIELD'; field: string; value: any }
        return ev.field === 'body' ? ev.value : context.createBody
      },
      createBaseBranch: ({ event, context }) => {
        const ev = event as { type: 'pr.UPDATE_CREATE_FIELD'; field: string; value: any }
        return ev.field === 'baseBranch' ? ev.value : context.createBaseBranch
      },
      createDraft: ({ event, context }) => {
        const ev = event as { type: 'pr.UPDATE_CREATE_FIELD'; field: string; value: any }
        return ev.field === 'draft' ? ev.value : context.createDraft
      },
    }),

    submitCreate: ({ context }) => {
      sendToBackend('pr.CREATE_PR', {
        title: context.createTitle,
        body: context.createBody,
        base: context.createBaseBranch || undefined,
        draft: context.createDraft,
      })
    },

    requestMerge: ({ event, context }) => {
      if (!context.selectedPR) return
      const ev = event as { type: 'pr.MERGE'; method?: 'merge' | 'squash' | 'rebase' }
      sendToBackend('pr.MERGE_PR', {
        number: context.selectedPR.number,
        method: ev.method || 'merge',
      })
    },

    requestClose: ({ context }) => {
      if (!context.selectedPR) return
      sendToBackend('pr.CLOSE_PR', { number: context.selectedPR.number })
    },

    requestToggleDraft: ({ context }) => {
      if (!context.selectedPR) return
      sendToBackend('pr.TOGGLE_DRAFT', {
        number: context.selectedPR.number,
        isDraft: context.selectedPR.isDraft,
      })
    },

    // After merge/close/create, refresh PR list
    refreshPRList: () => {
      sendToBackend('pr.LIST_OPEN_PRS', {})
      sendToBackend('pr.CHECK_BRANCH_PR', {})
    },

    selectPRAndLoadDiff: enqueueActions(({ enqueue, event }) => {
      const ev = event as { type: 'pr.SELECT_PR_BY_NUMBER'; number: number }
      enqueue.assign({
        isLoadingDetails: true,
        panelMode: 'existing' as const,
        viewMode: 'comparison' as const,
      })
      enqueue(() => {
        sendToBackend('pr.SELECT_PR', { number: ev.number })
      })
    }),

    loadDiffForSelectedPR: ({ event }) => {
      const ev = event as { type: 'pr.PR_DETAILS_RECEIVED'; data: { pr: GhPullRequest; comments: GhPRComment[] } }
      sendToBackend('pr.GET_BRANCH_DIFF', { baseBranch: ev.data.pr.baseRefName })
    },
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
    prDiff: null,

    openPRs: [],
    selectedPR: null,
    branchPR: null,
    prComments: [],
    viewMode: 'comparison',
    panelMode: 'create',
    isGhAvailable: false,

    createTitle: '',
    createBody: '',
    createBaseBranch: '',
    createDraft: false,

    isLoadingPRs: false,
    isCreating: false,
    isMerging: false,
    isClosing: false,
    isTogglingDraft: false,
    isLoadingDetails: false,
  },
  states: {
    idle: {
      on: {
        'pr.REFRESH_STATUS': {
          actions: ['setPrLoading', 'refreshPrStatus']
        },
        'pr.SELECT_FILE': { actions: 'selectPrFile' },
        'pr.VIEW_DIFF': { actions: 'viewPrDiff' },
        'pr.OPEN_FILE': { actions: 'openFile' },
        'pr.ERROR': { actions: 'assignPrError' },
        'pr.BASE_BRANCH_RECEIVED': { actions: 'handleBaseBranchReceived' },
        'pr.BRANCH_DIFF_RECEIVED': { actions: 'handleBranchDiffReceived' },
        'pr.FILE_DIFF_RECEIVED': { actions: 'handleFileDiffReceived' },
        'pr.STATUS_CHANGED': { actions: 'refreshPrStatus' },
        'CODE_STARTUP': { actions: 'handleCodeStartup' },

        // GitHub PR events from backend
        'pr.GH_AUTH_CHECKED': { actions: 'handleGhAuthChecked' },
        'pr.OPEN_PRS_RECEIVED': { actions: 'handleOpenPRsReceived' },
        'pr.PR_DETAILS_RECEIVED': { actions: ['handlePRDetailsReceived', 'loadDiffForSelectedPR'] },
        'pr.BRANCH_PR_CHECKED': { actions: 'handleBranchPRChecked' },
        'pr.PR_CREATED': { actions: ['handlePRCreated', 'refreshPRList'] },
        'pr.PR_MERGED': { actions: ['handlePRMerged', 'refreshPRList'] },
        'pr.PR_CLOSED': { actions: ['handlePRClosed', 'refreshPRList'] },
        'pr.PR_DRAFT_TOGGLED': { actions: 'handlePRDraftToggled' },

        // User actions
        'pr.LIST_PRS': { actions: ['requestListPRs', assign({ isLoadingPRs: true })] },
        'pr.SELECT_PR_BY_NUMBER': { actions: 'selectPRAndLoadDiff' },
        'pr.SWITCH_TO_PR_BRANCH': { actions: 'switchToPRBranch' },
        'pr.SET_VIEW_MODE': { actions: 'setViewMode' },
        'pr.SHOW_CREATE_FORM': { actions: 'showCreateForm' },
        'pr.CANCEL_CREATE': { actions: 'cancelCreate' },
        'pr.UPDATE_CREATE_FIELD': { actions: 'updateCreateField' },
        'pr.SUBMIT_CREATE': { actions: ['submitCreate', assign({ isCreating: true })] },
        'pr.MERGE': { actions: ['requestMerge', assign({ isMerging: true })] },
        'pr.CLOSE': { actions: ['requestClose', assign({ isClosing: true })] },
        'pr.TOGGLE_DRAFT': { actions: ['requestToggleDraft', assign({ isTogglingDraft: true })] },
      }
    }
  }
});
