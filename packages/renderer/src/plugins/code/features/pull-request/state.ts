import { setup, assign, enqueueActions } from 'xstate';
import { trpc } from '@/core/trpc';
import type { GitStatusFile, GitDiff } from '../commit/state';
import type { GhPullRequest, GhPRComment, GhReviewThread } from '@app/api';
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

let placeholderIdCounter = -1

const defaultLoadingStates = {
  isPrLoading: false,
  isGhChecking: false,
  isCreating: false,
  isMerging: false,
  isClosing: false,
  isTogglingDraft: false,
  isDeletingBranch: false,
  isUpdatingPR: false,
  isLoadingDetails: false,
  isLoadingPRs: false,
  isSubmittingComment: false,
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
  reviewThreads: GhReviewThread[]
  commentTab: 'discussion' | 'reviews'
  viewMode: 'files' | 'pr'
  isGhAvailable: boolean
  prAccess: boolean
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
  isUpdatingPR: boolean
  isSubmittingComment: boolean
  isLoadingDetails: boolean
  diffStale: boolean

  // PR selection tracking
  isManualPRSelection: boolean

  // Optimistic update rollback
  _commentSnapshot: GhPRComment[] | null
  _threadSnapshot: GhReviewThread[] | null
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
  | { type: 'pr.GH_AUTH_CHECKED'; data: { available: boolean; prAccess: boolean } }
  | { type: 'pr.OPEN_PRS_RECEIVED'; data: { prs: GhPullRequest[] } }
  | { type: 'pr.PR_DETAILS_RECEIVED'; data: { pr: GhPullRequest; comments: GhPRComment[] } }
  | { type: 'pr.PR_CREATED'; data: { pr: GhPullRequest } }
  | { type: 'pr.PR_MERGED'; data: { number: number } }
  | { type: 'pr.PR_CLOSED'; data: { number: number } }
  | { type: 'pr.PR_DRAFT_TOGGLED'; data: { number: number; isDraft: boolean } }
  | { type: 'pr.BRANCH_PR_CHECKED'; data: { pr: GhPullRequest | null } }
  | { type: 'pr.SMART_BASE_BRANCH_RECEIVED'; data: { branch: string } }
  | { type: 'pr.BRANCH_DELETED'; data: { branch: string } }
  | { type: 'pr.PR_UPDATED'; data: { number: number; title?: string; body?: string; base?: string } }
  | { type: 'pr.COMMENT_CREATED'; data: { number: number } }
  | { type: 'pr.COMMENT_EDITED'; data: { commentId: number } }
  | { type: 'pr.COMMENT_DELETED'; data: { commentId: number } }
  | { type: 'pr.REVIEW_THREADS_RECEIVED'; data: { threads: GhReviewThread[] } }
  | { type: 'pr.THREAD_REPLIED'; data: { prNumber: number } }
  | { type: 'pr.THREAD_RESOLVED'; data: { threadId: string } }
  | { type: 'pr.THREAD_UNRESOLVED'; data: { threadId: string } }
  | { type: 'pr.REVIEW_COMMENT_EDITED'; data: { commentId: number } }
  | { type: 'pr.REVIEW_COMMENT_DELETED'; data: { commentId: number } }
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
  | { type: 'pr.UPDATE_PR'; number: number; title?: string; body?: string; base?: string }
  | { type: 'pr.CREATE_COMMENT'; number: number; body: string }
  | { type: 'pr.EDIT_COMMENT'; commentId: number; body: string }
  | { type: 'pr.DELETE_COMMENT'; commentId: number }
  | { type: 'pr.REPLY_TO_THREAD'; prNumber: number; commentId: number; body: string }
  | { type: 'pr.RESOLVE_THREAD'; threadId: string }
  | { type: 'pr.UNRESOLVE_THREAD'; threadId: string }
  | { type: 'pr.EDIT_REVIEW_COMMENT'; commentId: number; body: string }
  | { type: 'pr.DELETE_REVIEW_COMMENT'; commentId: number }
  | { type: 'pr.SET_COMMENT_TAB'; tab: 'discussion' | 'reviews' }
  | { type: 'pr.REFRESH_PR'; number: number }
  | { type: 'pr.BACK_TO_BRANCH' }
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
        baseBranch: context.prBaseBranch,
        headBranch: context.selectedPR?.headRefName,
      })
    },

    assignPrError: assign({
      prError: ({ event }) => {
        const ev = event as { type: 'pr.ERROR'; message: string }
        return ev.message
      },
      ...defaultLoadingStates,
      // Only mark branch PR check as failed if we don't already have a selected PR
      // (otherwise a comment/mutation error would hide the PR selector)
      branchPRCheckFailed: ({ context }) => !context.selectedPR,
      // Rollback optimistic updates
      prComments: ({ context }) => context._commentSnapshot ?? context.prComments,
      reviewThreads: ({ context }) => context._threadSnapshot ?? context.reviewThreads,
      _commentSnapshot: null,
      _threadSnapshot: null,
    }),

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
      if (newBase !== context.prBaseBranch || context.prFiles.length === 0 || context.diffStale) {
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
      isPrLoading: false,
      diffStale: false,
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
        sendToBackend('pr.CHECK_GH_AUTH', {})
        self.send({ type: 'pr.REFRESH_STATUS' })
      } else {
        self.send({ type: 'pr.ERROR', message: 'No directory selected. Please select a directory first.' })
      }
    },

    // --- GitHub PR actions ---

    handleGhAuthChecked: assign({
      isGhAvailable: ({ event }) => {
        const ev = event as { type: 'pr.GH_AUTH_CHECKED'; data: { available: boolean; prAccess: boolean } }
        return ev.data.available
      },
      prAccess: ({ event }) => {
        const ev = event as { type: 'pr.GH_AUTH_CHECKED'; data: { available: boolean; prAccess: boolean } }
        return ev.data.prAccess
      },
    }),

    handleOpenPRsReceived: assign({
      openPRs: ({ event }) => {
        const ev = event as { type: 'pr.OPEN_PRS_RECEIVED'; data: { prs: GhPullRequest[] } }
        return ev.data.prs
      },
      isLoadingPRs: false
    }),

    // Accept incoming PR details. Guard against stale responses from background refreshes
    // (where a different PR's details arrive after the user already moved on), but always
    // accept when isManualPRSelection is true (user explicitly picked this PR from the dropdown).
    handlePRDetailsReceived: assign({
      selectedPR: ({ event, context }) => {
        const ev = event as { type: 'pr.PR_DETAILS_RECEIVED'; data: { pr: GhPullRequest; comments: GhPRComment[] } }
        if (!context.isManualPRSelection && context.selectedPR && context.selectedPR.number !== ev.data.pr.number) return context.selectedPR
        return ev.data.pr
      },
      prComments: ({ event, context }) => {
        const ev = event as { type: 'pr.PR_DETAILS_RECEIVED'; data: { pr: GhPullRequest; comments: GhPRComment[] } }
        if (!context.isManualPRSelection && context.selectedPR && context.selectedPR.number !== ev.data.pr.number) return context.prComments
        return ev.data.comments
      },
      isLoadingDetails: false
    }),

    handleBranchPRChecked: enqueueActions(({ enqueue, event, context }) => {
      const ev = event as { type: 'pr.BRANCH_PR_CHECKED'; data: { pr: GhPullRequest | null } }
      const incoming = ev.data.pr
      const unchanged = incoming?.number === context.selectedPR?.number
        && incoming?.updatedAt === context.selectedPR?.updatedAt

      enqueue.assign({
        branchPR: incoming,
        // Don't overwrite a manually selected PR
        selectedPR: context.isManualPRSelection
          ? context.selectedPR
          : (unchanged ? context.selectedPR : incoming ?? null),
        isGhChecking: false,
        branchPRCheckFailed: false,
        prCheckCompleted: true,
      })

      // Only auto-load diff for the current branch PR if no manual selection is active
      if (!context.isManualPRSelection) {
        if (incoming) {
          const needsDiff = incoming.baseRefName !== context.prBaseBranch
            || context.prFiles.length === 0
            || context.diffStale
          if (needsDiff) {
            enqueue.assign({ prBaseBranch: incoming.baseRefName })
            sendToBackend('pr.GET_BRANCH_DIFF', {
              baseBranch: incoming.baseRefName,
              headBranch: incoming.headRefName,
            })
          }
        } else {
          sendToBackend('pr.GET_SMART_BASE_BRANCH', {})
        }
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
      isManualPRSelection: false,
    }),

    handlePRClosed: assign({
      selectedPR: ({ context }) => context.selectedPR
        ? { ...context.selectedPR, state: 'CLOSED' as const }
        : null,
      branchPR: null,
      isClosing: false,
      isManualPRSelection: false,
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

    requestUpdatePR: ({ event }) => {
      const ev = event as { type: 'pr.UPDATE_PR'; number: number; title?: string; body?: string; base?: string }
      sendToBackend('pr.UPDATE_PR', { number: ev.number, title: ev.title, body: ev.body, base: ev.base })
    },

    handlePRUpdated: assign({
      selectedPR: ({ event, context }) => {
        const ev = event as { type: 'pr.PR_UPDATED'; data: { number: number; title?: string; body?: string; base?: string } }
        if (!context.selectedPR || context.selectedPR.number !== ev.data.number) return context.selectedPR
        return {
          ...context.selectedPR,
          ...(ev.data.title && { title: ev.data.title }),
          ...(ev.data.body !== undefined && { body: ev.data.body }),
          ...(ev.data.base && { baseRefName: ev.data.base }),
        }
      },
      isUpdatingPR: false,
      diffStale: ({ event, context }) => {
        const ev = event as { type: 'pr.PR_UPDATED'; data: { number: number; base?: string } }
        return ev.data.base ? true : context.diffStale
      },
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
        isManualPRSelection: false,
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
        isPrLoading: true,
        viewMode: 'files' as const,
        prComments: [],
        isManualPRSelection: true,
      })
      enqueue(() => {
        sendToBackend('pr.SELECT_PR', { number: ev.number })
      })
    }),

    // Load diff for the PR whose details just arrived. Same stale-response guard as
    // handlePRDetailsReceived — skip if this is a background refresh for a different PR,
    // but always load when the user manually selected it from the dropdown.
    loadDiffForSelectedPR: ({ event, context }) => {
      const ev = event as { type: 'pr.PR_DETAILS_RECEIVED'; data: { pr: GhPullRequest; comments: GhPRComment[] } }
      if (!context.isManualPRSelection && context.selectedPR?.number !== ev.data.pr.number) return
      sendToBackend('pr.GET_BRANCH_DIFF', {
        baseBranch: ev.data.pr.baseRefName,
        headBranch: ev.data.pr.headRefName,
      })
    },

    // --- Comment actions (optimistic) ---

    optimisticCreateComment: enqueueActions(({ enqueue, event, context }) => {
      const ev = event as { type: 'pr.CREATE_COMMENT'; number: number; body: string }
      const pid = placeholderIdCounter--
      const placeholder: GhPRComment = {
        id: `pending-${pid}`,
        body: ev.body,
        author: { login: '...' },
        createdAt: new Date().toISOString(),
        url: `pending-${pid}`,
        viewerDidAuthor: true,
      }
      enqueue.assign({
        _commentSnapshot: context._commentSnapshot ?? context.prComments,
        prComments: [...context.prComments, placeholder],
        isSubmittingComment: true,
      })
      enqueue(() => sendToBackend('pr.CREATE_COMMENT', { number: ev.number, body: ev.body }))
    }),

    optimisticEditComment: enqueueActions(({ enqueue, event, context }) => {
      const ev = event as { type: 'pr.EDIT_COMMENT'; commentId: number; body: string }
      enqueue.assign({
        _commentSnapshot: context._commentSnapshot ?? context.prComments,
        prComments: context.prComments.map(c =>
          c.url.includes(`issuecomment-${ev.commentId}`) ? { ...c, body: ev.body } : c
        ),
        isSubmittingComment: true,
      })
      enqueue(() => sendToBackend('pr.EDIT_COMMENT', { commentId: ev.commentId, body: ev.body }))
    }),

    optimisticDeleteComment: enqueueActions(({ enqueue, event, context }) => {
      const ev = event as { type: 'pr.DELETE_COMMENT'; commentId: number }
      enqueue.assign({
        _commentSnapshot: context._commentSnapshot ?? context.prComments,
        prComments: context.prComments.filter(c => !c.url.includes(`issuecomment-${ev.commentId}`)),
        isSubmittingComment: true,
      })
      enqueue(() => sendToBackend('pr.DELETE_COMMENT', { commentId: ev.commentId }))
    }),

    handleCommentMutated: enqueueActions(({ enqueue, context }) => {
      enqueue.assign({ _commentSnapshot: null })
      if (context.selectedPR) {
        enqueue(() => sendToBackend('pr.SELECT_PR', { number: context.selectedPR!.number }))
      }
    }),

    // --- Review thread actions (optimistic) ---

    optimisticReplyToThread: enqueueActions(({ enqueue, event, context }) => {
      const ev = event as { type: 'pr.REPLY_TO_THREAD'; prNumber: number; commentId: number; body: string }
      const pid = placeholderIdCounter--
      const placeholder = {
        id: `pending-${pid}`,
        databaseId: pid,
        body: ev.body,
        author: { login: '...' },
        createdAt: new Date().toISOString(),
        viewerDidAuthor: true,
      }
      enqueue.assign({
        _threadSnapshot: context._threadSnapshot ?? context.reviewThreads,
        reviewThreads: context.reviewThreads.map(t => {
          const hasComment = t.comments.some(c => c.databaseId === ev.commentId)
          if (!hasComment) return t
          return { ...t, comments: [...t.comments, placeholder] }
        }),
        isSubmittingComment: true,
      })
      enqueue(() => sendToBackend('pr.REPLY_TO_THREAD', { prNumber: ev.prNumber, commentId: ev.commentId, body: ev.body }))
    }),

    optimisticResolveThread: enqueueActions(({ enqueue, event, context }) => {
      const ev = event as { type: 'pr.RESOLVE_THREAD'; threadId: string }
      enqueue.assign({
        _threadSnapshot: context._threadSnapshot ?? context.reviewThreads,
        reviewThreads: context.reviewThreads.map(t =>
          t.id === ev.threadId ? { ...t, isResolved: true } : t
        ),
      })
      enqueue(() => sendToBackend('pr.RESOLVE_THREAD', { threadId: ev.threadId }))
    }),

    optimisticUnresolveThread: enqueueActions(({ enqueue, event, context }) => {
      const ev = event as { type: 'pr.UNRESOLVE_THREAD'; threadId: string }
      enqueue.assign({
        _threadSnapshot: context._threadSnapshot ?? context.reviewThreads,
        reviewThreads: context.reviewThreads.map(t =>
          t.id === ev.threadId ? { ...t, isResolved: false } : t
        ),
      })
      enqueue(() => sendToBackend('pr.UNRESOLVE_THREAD', { threadId: ev.threadId }))
    }),

    optimisticEditReviewComment: enqueueActions(({ enqueue, event, context }) => {
      const ev = event as { type: 'pr.EDIT_REVIEW_COMMENT'; commentId: number; body: string }
      enqueue.assign({
        _threadSnapshot: context._threadSnapshot ?? context.reviewThreads,
        reviewThreads: context.reviewThreads.map(t => ({
          ...t,
          comments: t.comments.map(c =>
            c.databaseId === ev.commentId ? { ...c, body: ev.body } : c
          ),
        })),
        isSubmittingComment: true,
      })
      enqueue(() => sendToBackend('pr.EDIT_REVIEW_COMMENT', { commentId: ev.commentId, body: ev.body }))
    }),

    optimisticDeleteReviewComment: enqueueActions(({ enqueue, event, context }) => {
      const ev = event as { type: 'pr.DELETE_REVIEW_COMMENT'; commentId: number }
      enqueue.assign({
        _threadSnapshot: context._threadSnapshot ?? context.reviewThreads,
        reviewThreads: context.reviewThreads.map(t => ({
          ...t,
          comments: t.comments.filter(c => c.databaseId !== ev.commentId),
        })),
        isSubmittingComment: true,
      })
      enqueue(() => sendToBackend('pr.DELETE_REVIEW_COMMENT', { commentId: ev.commentId }))
    }),

    handleReviewThreadsReceived: assign({
      reviewThreads: ({ event }) => {
        const ev = event as { type: 'pr.REVIEW_THREADS_RECEIVED'; data: { threads: GhReviewThread[] } }
        return ev.data.threads
      },
    }),

    handleThreadMutated: enqueueActions(({ enqueue, context }) => {
      enqueue.assign({ _threadSnapshot: null })
      if (context.selectedPR) {
        enqueue(() => sendToBackend('pr.GET_REVIEW_THREADS', { number: context.selectedPR!.number }))
      }
    }),

    fetchReviewThreads: ({ context }) => {
      if (context.selectedPR) {
        sendToBackend('pr.GET_REVIEW_THREADS', { number: context.selectedPR.number })
      }
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
    reviewThreads: [],
    commentTab: 'discussion',
    viewMode: 'files',
    isGhAvailable: false,
    prAccess: true,
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
    isUpdatingPR: false,
    isSubmittingComment: false,
    isLoadingDetails: false,
    diffStale: false,

    isManualPRSelection: false,

    _commentSnapshot: null,
    _threadSnapshot: null,
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
        // Reset check state to show "Checking..." during git changes and directory switches
        'pr.STATUS_CHANGED': { actions: [assign({ diffStale: true, isManualPRSelection: false, prCheckCompleted: false, isGhChecking: true, viewMode: 'files' as const }), 'refreshPrStatus'] },
        'CODE_STARTUP': {
          actions: [
            assign({
              prCheckCompleted: false,
              selectedPR: null,
              branchPR: null,
              prFiles: [],
              prBaseBranch: '',
              diffStale: false,
            }),
            'handleCodeStartup',
          ]
        },

        // GitHub PR events from backend
        'pr.GH_AUTH_CHECKED': { actions: 'handleGhAuthChecked' },
        'pr.OPEN_PRS_RECEIVED': { actions: 'handleOpenPRsReceived' },
        'pr.PR_DETAILS_RECEIVED': { actions: ['handlePRDetailsReceived', 'loadDiffForSelectedPR', 'fetchReviewThreads'] },
        'pr.BRANCH_PR_CHECKED': { actions: 'handleBranchPRChecked' },
        'pr.SMART_BASE_BRANCH_RECEIVED': { actions: 'handleSmartBaseBranchReceived' },
        'pr.AUTOFILL_RECEIVED': { actions: 'handleAutofillReceived' },
        'pr.PR_CREATED': { actions: ['handlePRCreated', 'refreshPRList'] },
        'pr.PR_MERGED': { actions: ['handlePRMerged', 'refreshPRList'] },
        'pr.PR_CLOSED': { actions: ['handlePRClosed', 'refreshPRList'] },
        'pr.PR_DRAFT_TOGGLED': { actions: 'handlePRDraftToggled' },
        'pr.BRANCH_DELETED': { actions: 'handleBranchDeleted' },
        'pr.PR_UPDATED': { actions: ['handlePRUpdated', 'refreshPrStatus'] },
        'pr.COMMENT_CREATED': { actions: [assign({ isSubmittingComment: false }), 'handleCommentMutated'] },
        'pr.COMMENT_EDITED': { actions: [assign({ isSubmittingComment: false }), 'handleCommentMutated'] },
        'pr.COMMENT_DELETED': { actions: [assign({ isSubmittingComment: false }), 'handleCommentMutated'] },
        'pr.REVIEW_THREADS_RECEIVED': { actions: 'handleReviewThreadsReceived' },
        'pr.THREAD_REPLIED': { actions: [assign({ isSubmittingComment: false }), 'handleThreadMutated'] },
        'pr.THREAD_RESOLVED': { actions: [assign({ isSubmittingComment: false }), 'handleThreadMutated'] },
        'pr.THREAD_UNRESOLVED': { actions: [assign({ isSubmittingComment: false }), 'handleThreadMutated'] },
        'pr.REVIEW_COMMENT_EDITED': { actions: [assign({ isSubmittingComment: false }), 'handleThreadMutated'] },
        'pr.REVIEW_COMMENT_DELETED': { actions: [assign({ isSubmittingComment: false }), 'handleThreadMutated'] },

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
        'pr.UPDATE_PR': { actions: ['requestUpdatePR', assign({ isUpdatingPR: true })] },
        'pr.CREATE_COMMENT': { actions: 'optimisticCreateComment' },
        'pr.EDIT_COMMENT': { actions: 'optimisticEditComment' },
        'pr.DELETE_COMMENT': { actions: 'optimisticDeleteComment' },
        'pr.REPLY_TO_THREAD': { actions: 'optimisticReplyToThread' },
        'pr.RESOLVE_THREAD': { actions: 'optimisticResolveThread' },
        'pr.UNRESOLVE_THREAD': { actions: 'optimisticUnresolveThread' },
        'pr.EDIT_REVIEW_COMMENT': { actions: 'optimisticEditReviewComment' },
        'pr.DELETE_REVIEW_COMMENT': { actions: 'optimisticDeleteReviewComment' },
        'pr.SET_COMMENT_TAB': { actions: assign({ commentTab: ({ event }) => (event as { type: 'pr.SET_COMMENT_TAB'; tab: 'discussion' | 'reviews' }).tab }) },
        'pr.REFRESH_PR': { actions: ['refreshPRDetails', assign({ isLoadingDetails: true })] },
        'pr.BACK_TO_BRANCH': {
          actions: [
            assign({ selectedPR: null, isManualPRSelection: false, prFiles: [], diffStale: true, prCheckCompleted: false, isGhChecking: true }),
            'refreshPrStatus',
          ]
        },
        'pr.CLEAR_ERROR': { actions: assign({ prError: null }) },
      }
    }
  }
});
