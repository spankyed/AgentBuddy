import { setup, assign } from 'xstate'
import { emit } from '@/core/helpers/actor-helpers'
import { rootEvents } from '@/core/router/bus-emitter'
import { systemBus } from '@/core/helpers/event-helpers'
import { z } from 'zod'
import { GitRepository } from '../services/git'
import { GitStatusFile, GitDiff, GhPullRequest, GhPRComment, GhReviewThread } from '../types'
import * as ghCli from '../services/gh-cli'

const pluginId = 'code' as const
const busEvent = systemBus(pluginId)

// Incoming events from frontend
export const IncomingPullRequestEvents = [
  busEvent('pr.GET_BASE_BRANCH', {}),
  busEvent('pr.GET_BRANCH_DIFF', { baseBranch: z.string().optional(), headBranch: z.string().optional() }),
  busEvent('pr.GET_BRANCH_FILE_DIFF', { path: z.string(), baseBranch: z.string() }),
  busEvent('pr.LIST_OPEN_PRS', {}),
  busEvent('pr.SELECT_PR', { number: z.number() }),
  busEvent('pr.CREATE_PR', { title: z.string(), body: z.string(), base: z.string().optional(), draft: z.boolean().optional() }),
  busEvent('pr.MERGE_PR', { number: z.number(), method: z.enum(['merge', 'squash', 'rebase']).optional() }),
  busEvent('pr.CLOSE_PR', { number: z.number() }),
  busEvent('pr.TOGGLE_DRAFT', { number: z.number(), isDraft: z.boolean() }),
  busEvent('pr.CHECK_BRANCH_PR', {}),
  busEvent('pr.CHECK_GH_AUTH', {}),
  busEvent('pr.GET_PR_AUTOFILL', {}),
  busEvent('pr.GET_SMART_BASE_BRANCH', {}),
  busEvent('pr.DELETE_BRANCH', { branch: z.string() }),
  busEvent('pr.UPDATE_PR', { number: z.number(), title: z.string().optional(), body: z.string().optional(), base: z.string().optional() }),
  busEvent('pr.CREATE_COMMENT', { number: z.number(), body: z.string() }),
  busEvent('pr.EDIT_COMMENT', { commentId: z.number(), body: z.string() }),
  busEvent('pr.DELETE_COMMENT', { commentId: z.number() }),
  busEvent('pr.GET_REVIEW_THREADS', { number: z.number() }),
  busEvent('pr.REPLY_TO_THREAD', { prNumber: z.number(), commentId: z.number(), body: z.string() }),
  busEvent('pr.RESOLVE_THREAD', { threadId: z.string() }),
  busEvent('pr.UNRESOLVE_THREAD', { threadId: z.string() }),
  busEvent('pr.EDIT_REVIEW_COMMENT', { commentId: z.number(), body: z.string() }),
  busEvent('pr.DELETE_REVIEW_COMMENT', { commentId: z.number() }),
] as const

// Outgoing events to frontend
export type OutgoingPullRequestEvents =
  | { type: 'pr.BASE_BRANCH_RECEIVED'; data: { branch: string } }
  | { type: 'pr.BRANCH_DIFF_RECEIVED'; data: { files: GitStatusFile[]; baseBranch: string } }
  | { type: 'pr.FILE_DIFF_RECEIVED'; data: GitDiff }
  | { type: 'pr.ERROR'; message: string }
  | { type: 'pr.STATUS_CHANGED'; data: { timestamp: Date } }
  | { type: 'pr.OPEN_PRS_RECEIVED'; data: { prs: GhPullRequest[] } }
  | { type: 'pr.PR_DETAILS_RECEIVED'; data: { pr: GhPullRequest; comments: GhPRComment[] } }
  | { type: 'pr.PR_CREATED'; data: { pr: GhPullRequest } }
  | { type: 'pr.PR_MERGED'; data: { number: number } }
  | { type: 'pr.PR_CLOSED'; data: { number: number } }
  | { type: 'pr.PR_DRAFT_TOGGLED'; data: { number: number; isDraft: boolean } }
  | { type: 'pr.BRANCH_PR_CHECKED'; data: { pr: GhPullRequest | null } }
  | { type: 'pr.GH_AUTH_CHECKED'; data: { available: boolean } }
  | { type: 'pr.AUTOFILL_RECEIVED'; data: { title: string; body: string } }
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

export interface Context {
  gitRepository: GitRepository | null
}

export type Event =
  | { type: 'pr.GET_BASE_BRANCH' }
  | { type: 'pr.GET_BRANCH_DIFF'; baseBranch?: string; headBranch?: string }
  | { type: 'pr.GET_BRANCH_FILE_DIFF'; path: string; baseBranch: string }
  | { type: 'pr.LIST_OPEN_PRS' }
  | { type: 'pr.SELECT_PR'; number: number }
  | { type: 'pr.CREATE_PR'; title: string; body: string; base?: string; draft?: boolean }
  | { type: 'pr.MERGE_PR'; number: number; method?: 'merge' | 'squash' | 'rebase' }
  | { type: 'pr.CLOSE_PR'; number: number }
  | { type: 'pr.TOGGLE_DRAFT'; number: number; isDraft: boolean }
  | { type: 'pr.CHECK_BRANCH_PR' }
  | { type: 'pr.CHECK_GH_AUTH' }
  | { type: 'pr.GET_PR_AUTOFILL' }
  | { type: 'pr.GET_SMART_BASE_BRANCH' }
  | { type: 'pr.DELETE_BRANCH'; branch: string }
  | { type: 'pr.UPDATE_PR'; number: number; title?: string; body?: string; base?: string }
  | { type: 'pr.CREATE_COMMENT'; number: number; body: string }
  | { type: 'pr.EDIT_COMMENT'; commentId: number; body: string }
  | { type: 'pr.DELETE_COMMENT'; commentId: number }
  | { type: 'pr.GET_REVIEW_THREADS'; number: number }
  | { type: 'pr.REPLY_TO_THREAD'; prNumber: number; commentId: number; body: string }
  | { type: 'pr.RESOLVE_THREAD'; threadId: string }
  | { type: 'pr.UNRESOLVE_THREAD'; threadId: string }
  | { type: 'pr.EDIT_REVIEW_COMMENT'; commentId: number; body: string }
  | { type: 'pr.DELETE_REVIEW_COMMENT'; commentId: number }
  | { type: 'pr.GIT_STATUS_CHANGED' }
  | { type: 'pr.UPDATE_BASE_DIRECTORY'; path: string; gitRepository: GitRepository };

function humanizeBranchName(branch: string): string {
  const stripped = branch.replace(/^(feature|fix|bugfix|hotfix|chore|refactor|docs|test|ci|build|perf|style|revert|release|AS|as)[\/_]/i, '')
  return stripped
    .replace(/[-_/]/g, ' ')
    .replace(/^\w/, c => c.toUpperCase())
    .trim()
}

function emitToFrontend(event: OutgoingPullRequestEvents) {
  const wrapped = emit(pluginId, event)
  rootEvents.emitOutgoing(wrapped.event)
}

function emitError(message: string) {
  emitToFrontend({ type: 'pr.ERROR', message })
}

/** Run async work that requires a git repository. Guards null repo, handles errors. */
function withRepo<T>(
  context: Context,
  work: (repo: GitRepository) => Promise<T>,
  onSuccess: (result: T) => void,
  onError: (error: any) => void = (e) => emitError(e.message)
) {
  if (!context.gitRepository) { emitError('No git repository available'); return }
  work(context.gitRepository).then(onSuccess).catch(onError)
}

export const pullRequestSystem = setup({
  types: {
    context: {} as Context,
    events: {} as Event,
    input: {} as { baseDirectory: string | null; gitRepository?: GitRepository | null }
  },
  actions: {
    getBaseBranch: ({ context }) => {
      withRepo(context,
        repo => repo.getBaseBranch({ preferUpstream: false }),
        branch => emitToFrontend({ type: 'pr.BASE_BRANCH_RECEIVED', data: { branch } })
      )
    },

    getSmartBaseBranch: ({ context }) => {
      withRepo(context,
        repo => repo.getPRBaseBranch(),
        branch => emitToFrontend({ type: 'pr.SMART_BASE_BRANCH_RECEIVED', data: { branch } })
      )
    },

    getBranchDiff: ({ event, context }) => {
      const ev = event as { type: 'pr.GET_BRANCH_DIFF'; baseBranch?: string; headBranch?: string }
      withRepo(context,
        repo => {
          const base = ev.baseBranch ? Promise.resolve(ev.baseBranch) : repo.getBaseBranch({ preferUpstream: false })
          const head = ev.headBranch ? `origin/${ev.headBranch}` : undefined
          return base.then(baseBranch =>
            repo.getBranchDiff(baseBranch, head).then(files => ({ files, baseBranch }))
          )
        },
        ({ files, baseBranch }) => emitToFrontend({ type: 'pr.BRANCH_DIFF_RECEIVED', data: { files, baseBranch } })
      )
    },

    getBranchFileDiff: ({ event, context }) => {
      const ev = event as { type: 'pr.GET_BRANCH_FILE_DIFF'; path: string; baseBranch: string }
      withRepo(context,
        repo => Promise.all([
          repo.getFileDiffBetweenBranches(ev.path, ev.baseBranch),
          repo.getFileContentFromBranch(ev.path, ev.baseBranch),
          repo.getFileContentFromBranch(ev.path, 'HEAD'),
        ]),
        ([diff, originalContent, modifiedContent]) => emitToFrontend({
          type: 'pr.FILE_DIFF_RECEIVED',
          data: { path: ev.path, diff, staged: false, originalContent, modifiedContent }
        })
      )
    },

    // --- GitHub CLI actions ---

    checkGhAuth: ({ context }) => {
      if (!context.gitRepository) {
        emitToFrontend({ type: 'pr.GH_AUTH_CHECKED', data: { available: false } })
        return
      }
      withRepo(context,
        repo => ghCli.checkAuth(repo.getWorkingDir()),
        available => emitToFrontend({ type: 'pr.GH_AUTH_CHECKED', data: { available } }),
        () => emitToFrontend({ type: 'pr.GH_AUTH_CHECKED', data: { available: false } })
      )
    },

    listOpenPRs: ({ context }) => {
      withRepo(context,
        repo => ghCli.listOpenPRs(repo.getWorkingDir()),
        prs => emitToFrontend({ type: 'pr.OPEN_PRS_RECEIVED', data: { prs } })
      )
    },

    selectPR: ({ event, context }) => {
      const ev = event as { type: 'pr.SELECT_PR'; number: number }
      withRepo(context,
        async repo => {
          const cwd = repo.getWorkingDir()
          const details = await ghCli.getPRDetails(cwd, ev.number)
          const { comments = [], ...pr } = details
          // Resolve GitHub asset URLs to signed S3 URLs so images load in Electron
          pr.body = await ghCli.resolveGitHubAssetUrls(pr.body, cwd)
          for (const comment of comments) {
            comment.body = await ghCli.resolveGitHubAssetUrls(comment.body, cwd)
          }
          return { pr, comments }
        },
        ({ pr, comments }) => {
          emitToFrontend({ type: 'pr.PR_DETAILS_RECEIVED', data: { pr, comments } })
        }
      )
    },

    createPR: ({ event, context }) => {
      const ev = event as { type: 'pr.CREATE_PR'; title: string; body: string; base?: string; draft?: boolean }
      withRepo(context,
        repo => repo.getCurrentBranch().then(head =>
          ghCli.createPR(repo.getWorkingDir(), { title: ev.title, body: ev.body, base: ev.base, head, draft: ev.draft })
        ),
        pr => emitToFrontend({ type: 'pr.PR_CREATED', data: { pr } })
      )
    },

    mergePR: ({ event, context }) => {
      const ev = event as { type: 'pr.MERGE_PR'; number: number; method?: 'merge' | 'squash' | 'rebase' }
      withRepo(context,
        repo => ghCli.mergePR(repo.getWorkingDir(), ev.number, ev.method),
        () => emitToFrontend({ type: 'pr.PR_MERGED', data: { number: ev.number } })
      )
    },

    closePR: ({ event, context }) => {
      const ev = event as { type: 'pr.CLOSE_PR'; number: number }
      withRepo(context,
        repo => ghCli.closePR(repo.getWorkingDir(), ev.number),
        () => emitToFrontend({ type: 'pr.PR_CLOSED', data: { number: ev.number } })
      )
    },

    toggleDraft: ({ event, context }) => {
      const ev = event as { type: 'pr.TOGGLE_DRAFT'; number: number; isDraft: boolean }
      withRepo(context,
        repo => {
          const cwd = repo.getWorkingDir()
          return ev.isDraft ? ghCli.markReady(cwd, ev.number) : ghCli.markDraft(cwd, ev.number)
        },
        () => emitToFrontend({ type: 'pr.PR_DRAFT_TOGGLED', data: { number: ev.number, isDraft: !ev.isDraft } })
      )
    },

    checkBranchPR: ({ context }) => {
      if (!context.gitRepository) {
        emitToFrontend({ type: 'pr.BRANCH_PR_CHECKED', data: { pr: null } })
        return
      }
      withRepo(context,
        async repo => {
          const cwd = repo.getWorkingDir()
          const branch = await repo.getCurrentBranch()
          const pr = await ghCli.getPRForBranch(cwd, branch)
          if (pr?.body) {
            pr.body = await ghCli.resolveGitHubAssetUrls(pr.body, cwd)
          }
          return pr
        },
        pr => emitToFrontend({ type: 'pr.BRANCH_PR_CHECKED', data: { pr } }),
        () => emitToFrontend({ type: 'pr.BRANCH_PR_CHECKED', data: { pr: null } })
      )
    },

    getPRAutofill: ({ context }) => {
      withRepo(context,
        repo => Promise.all([repo.getPRBaseBranch(), repo.getCurrentBranch()])
          .then(([baseBranch, currentBranch]) =>
            repo.getCommitsBetweenBranches(baseBranch).then(commits => ({ currentBranch, commits }))
          ),
        ({ currentBranch, commits }) => {
          let title = ''
          let body = ''
          if (commits.length === 1) {
            title = commits[0].subject
            body = commits[0].body
          } else if (commits.length > 1) {
            title = humanizeBranchName(currentBranch)
            body = commits.map(c => `- ${c.subject}`).join('\n')
          }
          emitToFrontend({ type: 'pr.AUTOFILL_RECEIVED', data: { title, body } })
        },
        () => emitToFrontend({ type: 'pr.AUTOFILL_RECEIVED', data: { title: '', body: '' } })
      )
    },

    updatePR: ({ event, context }) => {
      const ev = event as { type: 'pr.UPDATE_PR'; number: number; title?: string; body?: string; base?: string }
      withRepo(context,
        repo => ghCli.updatePR(repo.getWorkingDir(), ev.number, { title: ev.title, body: ev.body, base: ev.base }),
        () => emitToFrontend({ type: 'pr.PR_UPDATED', data: { number: ev.number, title: ev.title, body: ev.body, base: ev.base } })
      )
    },

    // --- Comment actions ---

    createComment: ({ event, context }) => {
      const ev = event as { type: 'pr.CREATE_COMMENT'; number: number; body: string }
      withRepo(context,
        repo => ghCli.createPRComment(repo.getWorkingDir(), ev.number, ev.body),
        () => emitToFrontend({ type: 'pr.COMMENT_CREATED', data: { number: ev.number } })
      )
    },

    editComment: ({ event, context }) => {
      const ev = event as { type: 'pr.EDIT_COMMENT'; commentId: number; body: string }
      withRepo(context,
        repo => ghCli.editPRComment(repo.getWorkingDir(), ev.commentId, ev.body),
        () => emitToFrontend({ type: 'pr.COMMENT_EDITED', data: { commentId: ev.commentId } })
      )
    },

    deleteComment: ({ event, context }) => {
      const ev = event as { type: 'pr.DELETE_COMMENT'; commentId: number }
      withRepo(context,
        repo => ghCli.deletePRComment(repo.getWorkingDir(), ev.commentId),
        () => emitToFrontend({ type: 'pr.COMMENT_DELETED', data: { commentId: ev.commentId } })
      )
    },

    getReviewThreads: ({ event, context }) => {
      const ev = event as { type: 'pr.GET_REVIEW_THREADS'; number: number }
      withRepo(context,
        repo => ghCli.getReviewThreads(repo.getWorkingDir(), ev.number),
        threads => emitToFrontend({ type: 'pr.REVIEW_THREADS_RECEIVED', data: { threads } })
      )
    },

    replyToThread: ({ event, context }) => {
      const ev = event as { type: 'pr.REPLY_TO_THREAD'; prNumber: number; commentId: number; body: string }
      withRepo(context,
        repo => ghCli.replyToReviewThread(repo.getWorkingDir(), ev.prNumber, ev.commentId, ev.body),
        () => emitToFrontend({ type: 'pr.THREAD_REPLIED', data: { prNumber: ev.prNumber } })
      )
    },

    resolveThread: ({ event, context }) => {
      const ev = event as { type: 'pr.RESOLVE_THREAD'; threadId: string }
      withRepo(context,
        _repo => ghCli.resolveReviewThread(_repo.getWorkingDir(), ev.threadId),
        () => emitToFrontend({ type: 'pr.THREAD_RESOLVED', data: { threadId: ev.threadId } })
      )
    },

    unresolveThread: ({ event, context }) => {
      const ev = event as { type: 'pr.UNRESOLVE_THREAD'; threadId: string }
      withRepo(context,
        _repo => ghCli.unresolveReviewThread(_repo.getWorkingDir(), ev.threadId),
        () => emitToFrontend({ type: 'pr.THREAD_UNRESOLVED', data: { threadId: ev.threadId } })
      )
    },

    editReviewComment: ({ event, context }) => {
      const ev = event as { type: 'pr.EDIT_REVIEW_COMMENT'; commentId: number; body: string }
      withRepo(context,
        repo => ghCli.editReviewComment(repo.getWorkingDir(), ev.commentId, ev.body),
        () => emitToFrontend({ type: 'pr.REVIEW_COMMENT_EDITED', data: { commentId: ev.commentId } })
      )
    },

    deleteReviewComment: ({ event, context }) => {
      const ev = event as { type: 'pr.DELETE_REVIEW_COMMENT'; commentId: number }
      withRepo(context,
        repo => ghCli.deleteReviewComment(repo.getWorkingDir(), ev.commentId),
        () => emitToFrontend({ type: 'pr.REVIEW_COMMENT_DELETED', data: { commentId: ev.commentId } })
      )
    },

    deleteBranch: ({ event, context }) => {
      const ev = event as { type: 'pr.DELETE_BRANCH'; branch: string }
      withRepo(context,
        repo => repo.deleteRemoteBranch(ev.branch),
        () => emitToFrontend({ type: 'pr.BRANCH_DELETED', data: { branch: ev.branch } })
      )
    },

    handleGitStatusChanged: () => {
      emitToFrontend({ type: 'pr.STATUS_CHANGED', data: { timestamp: new Date() } })
    },

    updateBaseDirectory: assign({
      gitRepository: ({ event }) => {
        const ev = event as { type: 'pr.UPDATE_BASE_DIRECTORY'; path: string; gitRepository: GitRepository }
        return ev.gitRepository
      }
    }),

    selfRefreshPrStatus: ({ self }) => {
      self.send({ type: 'pr.CHECK_GH_AUTH' })
      self.send({ type: 'pr.LIST_OPEN_PRS' })
      self.send({ type: 'pr.CHECK_BRANCH_PR' })
    }
  }
}).createMachine({
  id: 'pull-request',
  initial: 'idle',
  context: ({ input }) => ({
    gitRepository: input?.gitRepository || (input?.baseDirectory ? new GitRepository(input.baseDirectory) : null)
  }),
  states: {
    idle: {
      on: {
        'pr.GET_BASE_BRANCH': { actions: 'getBaseBranch' },
        'pr.GET_BRANCH_DIFF': { actions: 'getBranchDiff' },
        'pr.GET_BRANCH_FILE_DIFF': { actions: 'getBranchFileDiff' },
        'pr.LIST_OPEN_PRS': { actions: 'listOpenPRs' },
        'pr.SELECT_PR': { actions: 'selectPR' },
        'pr.CREATE_PR': { actions: 'createPR' },
        'pr.MERGE_PR': { actions: 'mergePR' },
        'pr.CLOSE_PR': { actions: 'closePR' },
        'pr.TOGGLE_DRAFT': { actions: 'toggleDraft' },
        'pr.CHECK_BRANCH_PR': { actions: 'checkBranchPR' },
        'pr.GET_SMART_BASE_BRANCH': { actions: 'getSmartBaseBranch' },
        'pr.DELETE_BRANCH': { actions: 'deleteBranch' },
        'pr.UPDATE_PR': { actions: 'updatePR' },
        'pr.CREATE_COMMENT': { actions: 'createComment' },
        'pr.EDIT_COMMENT': { actions: 'editComment' },
        'pr.DELETE_COMMENT': { actions: 'deleteComment' },
        'pr.GET_REVIEW_THREADS': { actions: 'getReviewThreads' },
        'pr.REPLY_TO_THREAD': { actions: 'replyToThread' },
        'pr.RESOLVE_THREAD': { actions: 'resolveThread' },
        'pr.UNRESOLVE_THREAD': { actions: 'unresolveThread' },
        'pr.EDIT_REVIEW_COMMENT': { actions: 'editReviewComment' },
        'pr.DELETE_REVIEW_COMMENT': { actions: 'deleteReviewComment' },
        'pr.CHECK_GH_AUTH': { actions: 'checkGhAuth' },
        'pr.GET_PR_AUTOFILL': { actions: 'getPRAutofill' },
        'pr.GIT_STATUS_CHANGED': { actions: 'handleGitStatusChanged' },
        'pr.UPDATE_BASE_DIRECTORY': { actions: ['updateBaseDirectory', 'selfRefreshPrStatus'] }
      }
    }
  }
})
