import { setup, assign } from 'xstate'
import { emit } from '@/core/helpers/actor-helpers'
import { rootEvents } from '@/core/router/bus-emitter'
import { systemBus } from '@/core/helpers/event-helpers'
import { z } from 'zod'
import { GitRepository } from '../services/git'
import { GitStatusFile, GitDiff, GhPullRequest, GhPRComment } from '../types'
import { requireGitRepository } from '../utils/git-helpers'
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
  | { type: 'pr.GIT_STATUS_CHANGED' }
  | { type: 'pr.UPDATE_BASE_DIRECTORY'; path: string; gitRepository: GitRepository };

function emitToFrontend(event: OutgoingPullRequestEvents) {
  const wrapped = emit(pluginId, event)
  rootEvents.emitOutgoing(wrapped.event)
}

function emitError(message: string) {
  emitToFrontend({ type: 'pr.ERROR', message })
}

export const pullRequestSystem = setup({
  types: {
    context: {} as Context,
    events: {} as Event,
    input: {} as { baseDirectory: string | null; gitRepository?: GitRepository | null }
  },
  actions: {
    getBaseBranch: async ({ context }) => {
      if (!requireGitRepository(context, 'pr.ERROR')) return

      try {
        const branch = await context.gitRepository!.getPRBaseBranch()
        emitToFrontend({ type: 'pr.BASE_BRANCH_RECEIVED', data: { branch } })
      } catch (error: any) {
        emitError(error.message)
      }
    },

    getBranchDiff: async ({ event, context }) => {
      const ev = event as { type: 'pr.GET_BRANCH_DIFF'; baseBranch?: string }
      if (!requireGitRepository(context, 'pr.ERROR')) return

      try {
        const { gitRepository } = context
        const baseBranch = ev.baseBranch || await gitRepository!.getPRBaseBranch()
        const files = await gitRepository!.getBranchDiff(baseBranch)
        emitToFrontend({ type: 'pr.BRANCH_DIFF_RECEIVED', data: { files, baseBranch } })
      } catch (error: any) {
        emitError(error.message)
      }
    },

    getBranchFileDiff: async ({ event, context }) => {
      const ev = event as { type: 'pr.GET_BRANCH_FILE_DIFF'; path: string; baseBranch: string }
      if (!requireGitRepository(context, 'pr.ERROR')) return

      try {
        const { gitRepository } = context
        const diff = await gitRepository!.getFileDiffBetweenBranches(ev.path, ev.baseBranch)
        const originalContent = await gitRepository!.getFileContentFromBranch(ev.path, ev.baseBranch)
        const modifiedContent = await gitRepository!.getFileContentFromBranch(ev.path, 'HEAD')

        emitToFrontend({
          type: 'pr.FILE_DIFF_RECEIVED',
          data: { path: ev.path, diff, staged: false, originalContent, modifiedContent }
        })
      } catch (error: any) {
        emitError(error.message)
      }
    },

    // --- GitHub CLI actions ---

    checkGhAuth: async ({ context }) => {
      if (!context.gitRepository) {
        emitToFrontend({ type: 'pr.GH_AUTH_CHECKED', data: { available: false } })
        return
      }
      const available = await ghCli.checkAuth(context.gitRepository.getWorkingDir())
      emitToFrontend({ type: 'pr.GH_AUTH_CHECKED', data: { available } })
    },

    listOpenPRs: async ({ context }) => {
      if (!context.gitRepository) { emitError('No git repository available'); return }
      try {
        const prs = await ghCli.listOpenPRs(context.gitRepository.getWorkingDir())
        emitToFrontend({ type: 'pr.OPEN_PRS_RECEIVED', data: { prs } })
      } catch (error: any) {
        emitError(error.message)
      }
    },

    selectPR: async ({ event, context }) => {
      const ev = event as { type: 'pr.SELECT_PR'; number: number }
      if (!context.gitRepository) { emitError('No git repository available'); return }
      try {
        const details = await ghCli.getPRDetails(context.gitRepository.getWorkingDir(), ev.number)
        const { comments, ...pr } = details
        emitToFrontend({ type: 'pr.PR_DETAILS_RECEIVED', data: { pr, comments: comments || [] } })
      } catch (error: any) {
        emitError(error.message)
      }
    },

    createPR: async ({ event, context }) => {
      const ev = event as { type: 'pr.CREATE_PR'; title: string; body: string; base?: string; draft?: boolean }
      if (!context.gitRepository) return
      try {
        const pr = await ghCli.createPR(context.gitRepository.getWorkingDir(), {
          title: ev.title,
          body: ev.body,
          base: ev.base,
          draft: ev.draft,
        })
        emitToFrontend({ type: 'pr.PR_CREATED', data: { pr } })
      } catch (error: any) {
        emitError(error.message)
      }
    },

    mergePR: async ({ event, context }) => {
      const ev = event as { type: 'pr.MERGE_PR'; number: number; method?: 'merge' | 'squash' | 'rebase' }
      if (!context.gitRepository) return
      try {
        await ghCli.mergePR(context.gitRepository.getWorkingDir(), ev.number, ev.method)
        emitToFrontend({ type: 'pr.PR_MERGED', data: { number: ev.number } })
      } catch (error: any) {
        emitError(error.message)
      }
    },

    closePR: async ({ event, context }) => {
      const ev = event as { type: 'pr.CLOSE_PR'; number: number }
      if (!context.gitRepository) return
      try {
        await ghCli.closePR(context.gitRepository.getWorkingDir(), ev.number)
        emitToFrontend({ type: 'pr.PR_CLOSED', data: { number: ev.number } })
      } catch (error: any) {
        emitError(error.message)
      }
    },

    toggleDraft: async ({ event, context }) => {
      const ev = event as { type: 'pr.TOGGLE_DRAFT'; number: number; isDraft: boolean }
      if (!context.gitRepository) { emitError('No git repository available'); return }
      try {
        if (ev.isDraft) {
          // Currently draft → mark ready
          await ghCli.markReady(context.gitRepository.getWorkingDir(), ev.number)
        } else {
          // Currently ready → mark draft
          await ghCli.markDraft(context.gitRepository.getWorkingDir(), ev.number)
        }
        emitToFrontend({ type: 'pr.PR_DRAFT_TOGGLED', data: { number: ev.number, isDraft: !ev.isDraft } })
      } catch (error: any) {
        emitError(error.message)
      }
    },

    checkBranchPR: async ({ context }) => {
      if (!context.gitRepository) { emitToFrontend({ type: 'pr.BRANCH_PR_CHECKED', data: { pr: null } }); return }
      try {
        const branch = await context.gitRepository.getCurrentBranch()
        const pr = await ghCli.getPRForBranch(context.gitRepository.getWorkingDir(), branch)
        emitToFrontend({ type: 'pr.BRANCH_PR_CHECKED', data: { pr } })
      } catch (error: any) {
        emitToFrontend({ type: 'pr.BRANCH_PR_CHECKED', data: { pr: null } })
      }
    },

    handleGitStatusChanged: async () => {
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
        'pr.GIT_STATUS_CHANGED': { actions: 'handleGitStatusChanged' },
        'pr.UPDATE_BASE_DIRECTORY': { actions: ['updateBaseDirectory', 'selfRefreshPrStatus'] }
      }
    }
  }
})
