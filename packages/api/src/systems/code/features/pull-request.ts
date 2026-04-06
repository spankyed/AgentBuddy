import { setup, assign } from 'xstate'
import { emit } from '@/core/helpers/actor-helpers'
import { rootEvents } from '@/core/router/bus-emitter'
import { systemBus } from '@/core/helpers/event-helpers'
import { z } from 'zod'
import { GitRepository } from '../services/git'
import { GitStatusFile, GitDiff, GhPullRequest, GhPRComment } from '../types'
import * as ghCli from '../services/gh-cli'

const pluginId = 'code' as const
const busEvent = systemBus(pluginId)

// Incoming events from frontend
export const IncomingPullRequestEvents = [
  busEvent('pr.GET_BASE_BRANCH', {}),
  busEvent('pr.GET_BRANCH_DIFF', { baseBranch: z.string().optional() }),
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

export interface Context {
  gitRepository: GitRepository | null
}

export type Event =
  | { type: 'pr.GET_BASE_BRANCH' }
  | { type: 'pr.GET_BRANCH_DIFF'; baseBranch?: string }
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
  | { type: 'pr.GIT_STATUS_CHANGED' }
  | { type: 'pr.UPDATE_BASE_DIRECTORY'; path: string; gitRepository: GitRepository };

function humanizeBranchName(branch: string): string {
  const stripped = branch.replace(/^(feature|fix|bugfix|hotfix|chore|refactor|docs|test|ci|build|perf|style|revert|release|AS|as)[\/_]/i, '')
  return stripped
    .replace(/[-_/]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
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
        repo => repo.getPRBaseBranch(),
        branch => emitToFrontend({ type: 'pr.BASE_BRANCH_RECEIVED', data: { branch } })
      )
    },

    getBranchDiff: ({ event, context }) => {
      const ev = event as { type: 'pr.GET_BRANCH_DIFF'; baseBranch?: string }
      withRepo(context,
        repo => {
          const base = ev.baseBranch ? Promise.resolve(ev.baseBranch) : repo.getPRBaseBranch()
          return base.then(baseBranch =>
            repo.getBranchDiff(baseBranch).then(files => ({ files, baseBranch }))
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
        repo => ghCli.getPRDetails(repo.getWorkingDir(), ev.number),
        details => {
          const { comments, ...pr } = details
          emitToFrontend({ type: 'pr.PR_DETAILS_RECEIVED', data: { pr, comments: comments || [] } })
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
        repo => repo.getCurrentBranch().then(branch => ghCli.getPRForBranch(repo.getWorkingDir(), branch)),
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
      self.send({ type: 'pr.GET_BASE_BRANCH' })
      self.send({ type: 'pr.GET_BRANCH_DIFF' })
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
        'pr.CHECK_GH_AUTH': { actions: 'checkGhAuth' },
        'pr.GET_PR_AUTOFILL': { actions: 'getPRAutofill' },
        'pr.GIT_STATUS_CHANGED': { actions: 'handleGitStatusChanged' },
        'pr.UPDATE_BASE_DIRECTORY': { actions: ['updateBaseDirectory', 'selfRefreshPrStatus'] }
      }
    }
  }
})
