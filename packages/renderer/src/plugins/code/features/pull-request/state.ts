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
  isGhChecking: false,
  isCreating: false,
  isMerging: false,
  isClosing: false,
  isTogglingDraft: false,
  isLoadingDetails: false,
  isLoadingPRs: false,
}

export interface Context {
  // Branch comparison
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
  viewMode: 'files' | 'pr'
  isGhAvailable: boolean
  isGhChecking: boolean
  branchPRCheckFailed: boolean
  prCheckCompleted: boolean

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
  isDeletingBranch: boolean
  isLoadingDetails: boolean
}

export type Event =
  // Branch comparison
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
  | { type: 'pr.SMART_BASE_BRANCH_RECEIVED'; data: { branch: string } }
  | { type: 'pr.BRANCH_DELETED'; data: { branch: string } }
  | { type: 'pr.AUTOFILL_RECEIVED'; data: { title: string; body: string } }
  // User actions
  | { type: 'pr.LIST_PRS' }
  | { type: 'pr.SELECT_PR_BY_NUMBER'; number: number }
  | { type: 'pr.SWITCH_TO_PR_BRANCH'; branchName: string }
  | { type: 'pr.SET_VIEW_MODE'; mode: 'files' | 'pr' }
  | { type: 'pr.NEW_PR' }
  | { type: 'pr.UPDATE_CREATE_FIELD'; field: string; value: any }
  | { type: 'pr.SUBMIT_CREATE' }
  | { type: 'pr.SUBMIT_CREATE_DRAFT' }
  | { type: 'pr.MERGE'; method?: 'merge' | 'squash' | 'rebase' }
  | { type: 'pr.CLOSE' }
  | { type: 'pr.TOGGLE_DRAFT' }
  | { type: 'pr.DELETE_BRANCH' }
  | { type: 'pr.REFRESH_PR'; number: number }
  | { type: 'pr.CLEAR_ERROR' };

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
      branchPRCheckFailed: true,
    }),

    setPrLoading: assign({ isPrLoading: true, branchPRCheckFailed: false }),

    handleBaseBranchReceived: assign({
      prBaseBranch: ({ event }) => {
        const ev = event as { type: 'pr.BASE_BRANCH_RECEIVED'; data: { branch: string } }
        return ev.data.branch
      },
      prError: null
    }),

    handleSmartBaseBranchReceived: enqueueActions(({ enqueue, event, context }) => {
      const ev = event as { type: 'pr.SMART_BASE_BRANCH_RECEIVED'; data: { branch: string } }
      const newBase = ev.data.branch
      enqueue.assign({ prBaseBranch: newBase })
      if (newBase !== context.prBaseBranch || context.prFiles.length === 0) {
        sendToBackend('pr.GET_BRANCH_DIFF', { baseBranch: newBase })
      }
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
      },
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

    handleBranchPRChecked: enqueueActions(({ enqueue, event, context }) => {
      const ev = event as { type: 'pr.BRANCH_PR_CHECKED'; data: { pr: GhPullRequest | null } }
      enqueue.assign({
        branchPR: ev.data.pr,
        selectedPR: ev.data.pr
          ? (context.selectedPR?.number === ev.data.pr.number ? ev.data.pr : context.selectedPR || ev.data.pr)
          : context.selectedPR,
        isGhChecking: false,
        branchPRCheckFailed: false,
        prCheckCompleted: true,
      })
      if (ev.data.pr) {
        const newBase = ev.data.pr.baseRefName
        if (newBase !== context.prBaseBranch || context.prFiles.length === 0) {
          enqueue.assign({ prBaseBranch: newBase })
          sendToBackend('pr.GET_BRANCH_DIFF', { baseBranch: newBase })
        }
      } else {
        sendToBackend('pr.GET_SMART_BASE_BRANCH', {})
      }
    }),

    handlePRCreated: assign({
      selectedPR: ({ event }) => {
        const ev = event as { type: 'pr.PR_CREATED'; data: { pr: GhPullRequest } }
        return ev.data.pr
      },
      isCreating: false,
      createTitle: '',
      createBody: '',
      createBaseBranch: '',
      createDraft: false,
    }),

    handlePRMerged: assign({
      selectedPR: ({ context }) => context.selectedPR
        ? { ...context.selectedPR, state: 'MERGED' as const }
        : null,
      branchPR: null,
      isMerging: false,
    }),

    handlePRClosed: assign({
      selectedPR: ({ context }) => context.selectedPR
        ? { ...context.selectedPR, state: 'CLOSED' as const }
        : null,
      branchPR: null,
      isClosing: false,
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

    requestDeleteBranch: ({ context }) => {
      if (context.selectedPR?.headRefName) {
        sendToBackend('pr.DELETE_BRANCH', { branch: context.selectedPR.headRefName })
      }
    },

    handleBranchDeleted: assign({
      selectedPR: null,
      branchPR: null,
      isDeletingBranch: false,
    }),

    // User-initiated actions
    requestListPRs: ({ }) => {
      sendToBackend('pr.LIST_OPEN_PRS', {})
    },

    switchToPRBranch: ({ event }) => {
      const ev = event as { type: 'pr.SWITCH_TO_PR_BRANCH'; branchName: string }
      sendToBackend('commit.CHECKOUT_BRANCH', { branchName: ev.branchName })
    },

    setViewMode: assign({
      viewMode: ({ event }) => {
        const ev = event as { type: 'pr.SET_VIEW_MODE'; mode: 'files' | 'pr' }
        return ev.mode
      },
      prError: null,
    }),

    newPR: enqueueActions(({ enqueue }) => {
      enqueue.assign({
        selectedPR: null,
        viewMode: 'pr' as const,
        prError: null,
        createTitle: '',
        createBody: '',
        createDraft: false,
      })
      enqueue(() => {
        sendToBackend('pr.GET_PR_AUTOFILL', {})
      })
    }),

    handleAutofillReceived: assign({
      createTitle: ({ event, context }) => {
        const ev = event as { type: 'pr.AUTOFILL_RECEIVED'; data: { title: string; body: string } }
        return context.createTitle || ev.data.title
      },
      createBody: ({ event, context }) => {
        const ev = event as { type: 'pr.AUTOFILL_RECEIVED'; data: { title: string; body: string } }
        return context.createBody || ev.data.body
      },
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
        base: context.createBaseBranch || context.prBaseBranch || undefined,
        draft: context.createDraft,
      })
    },

    submitCreateDraft: ({ context }) => {
      sendToBackend('pr.CREATE_PR', {
        title: context.createTitle,
        body: context.createBody,
        base: context.createBaseBranch || context.prBaseBranch || undefined,
        draft: true,
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

    refreshPRList: () => {
      sendToBackend('pr.LIST_OPEN_PRS', {})
      sendToBackend('pr.CHECK_BRANCH_PR', {})
    },

    refreshPRDetails: ({ event }) => {
      const ev = event as { type: 'pr.REFRESH_PR'; number: number }
      sendToBackend('pr.SELECT_PR', { number: ev.number })
    },

    selectPRAndLoadDiff: enqueueActions(({ enqueue, event }) => {
      const ev = event as { type: 'pr.SELECT_PR_BY_NUMBER'; number: number }
      enqueue.assign({
        isLoadingDetails: true,
        viewMode: 'files' as const,
        prComments: [],
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
    viewMode: 'files',
    isGhAvailable: false,
    isGhChecking: false,
    branchPRCheckFailed: false,
    prCheckCompleted: false,

    createTitle: '',
    createBody: '',
    createBaseBranch: '',
    createDraft: false,

    isLoadingPRs: false,
    isCreating: false,
    isMerging: false,
    isClosing: false,
    isTogglingDraft: false,
    isDeletingBranch: false,
    isLoadingDetails: false,
  },
  states: {
    idle: {
      on: {
        'pr.REFRESH_STATUS': {
          actions: [
            assign({
              isPrLoading: ({ context }) => context.prFiles.length === 0,
              isGhChecking: ({ context }) => !context.prCheckCompleted,
              branchPRCheckFailed: false,
            }),
            'refreshPrStatus',
          ]
        },
        'pr.SELECT_FILE': { actions: 'selectPrFile' },
        'pr.VIEW_DIFF': { actions: 'viewPrDiff' },
        'pr.OPEN_FILE': { actions: 'openFile' },
        'pr.ERROR': { actions: 'assignPrError' },
        'pr.BASE_BRANCH_RECEIVED': { actions: 'handleBaseBranchReceived' },
        'pr.BRANCH_DIFF_RECEIVED': { actions: 'handleBranchDiffReceived' },
        'pr.FILE_DIFF_RECEIVED': { actions: 'handleFileDiffReceived' },
        'pr.STATUS_CHANGED': { actions: [assign({ prFiles: [], prCheckCompleted: false, isGhChecking: true }), 'refreshPrStatus'] },
        'CODE_STARTUP': { actions: 'handleCodeStartup' },

        // GitHub PR events from backend
        'pr.GH_AUTH_CHECKED': { actions: 'handleGhAuthChecked' },
        'pr.OPEN_PRS_RECEIVED': { actions: 'handleOpenPRsReceived' },
        'pr.PR_DETAILS_RECEIVED': { actions: ['handlePRDetailsReceived', 'loadDiffForSelectedPR'] },
        'pr.BRANCH_PR_CHECKED': { actions: 'handleBranchPRChecked' },
        'pr.SMART_BASE_BRANCH_RECEIVED': { actions: 'handleSmartBaseBranchReceived' },
        'pr.AUTOFILL_RECEIVED': { actions: 'handleAutofillReceived' },
        'pr.PR_CREATED': { actions: ['handlePRCreated', 'refreshPRList'] },
        'pr.PR_MERGED': { actions: ['handlePRMerged', 'refreshPRList'] },
        'pr.PR_CLOSED': { actions: ['handlePRClosed', 'refreshPRList'] },
        'pr.PR_DRAFT_TOGGLED': { actions: 'handlePRDraftToggled' },
        'pr.BRANCH_DELETED': { actions: 'handleBranchDeleted' },

        // User actions
        'pr.LIST_PRS': { actions: ['requestListPRs', assign({ isLoadingPRs: true })] },
        'pr.SELECT_PR_BY_NUMBER': { actions: 'selectPRAndLoadDiff' },
        'pr.SWITCH_TO_PR_BRANCH': { actions: 'switchToPRBranch' },
        'pr.SET_VIEW_MODE': { actions: 'setViewMode' },
        'pr.NEW_PR': { actions: 'newPR' },
        'pr.UPDATE_CREATE_FIELD': { actions: 'updateCreateField' },
        'pr.SUBMIT_CREATE': { actions: ['submitCreate', assign({ isCreating: true })] },
        'pr.SUBMIT_CREATE_DRAFT': { actions: ['submitCreateDraft', assign({ isCreating: true })] },
        'pr.MERGE': { actions: ['requestMerge', assign({ isMerging: true })] },
        'pr.CLOSE': { actions: ['requestClose', assign({ isClosing: true })] },
        'pr.TOGGLE_DRAFT': { actions: ['requestToggleDraft', assign({ isTogglingDraft: true })] },
        'pr.DELETE_BRANCH': { actions: ['requestDeleteBranch', assign({ isDeletingBranch: true })] },
        'pr.REFRESH_PR': { actions: ['refreshPRDetails', assign({ isLoadingDetails: true })] },
        'pr.CLEAR_ERROR': { actions: assign({ prError: null }) },
      }
    }
  }
});
