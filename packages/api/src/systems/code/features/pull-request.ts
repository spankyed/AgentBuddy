import { setup, assign } from 'xstate'
import { emit } from '@/core/utils/actor-helpers'
import { rootEvents } from '@/core/router/bus-emitter'
import { systemBus } from '@/core/utils/event-helpers'
import { z } from 'zod'
import { GitRepository } from '../services/git'
import { GitStatusFile, GitDiff } from '../types'
import { requireGitRepository } from '../utils/git-helpers'

const pluginId = 'code' as const
const busEvent = systemBus(pluginId)

// Incoming events from frontend
export const IncomingPullRequestEvents = [
  busEvent('pr.GET_BASE_BRANCH', {}),
  busEvent('pr.GET_BRANCH_DIFF', { baseBranch: z.string().optional() }),
  busEvent('pr.GET_BRANCH_FILE_DIFF', { path: z.string(), baseBranch: z.string() }),
] as const

// Outgoing events to frontend
export type OutgoingPullRequestEvents =
  | { type: 'pr.BASE_BRANCH_RECEIVED'; data: { branch: string } }
  | { type: 'pr.BRANCH_DIFF_RECEIVED'; data: { files: GitStatusFile[]; baseBranch: string } }
  | { type: 'pr.FILE_DIFF_RECEIVED'; data: GitDiff }
  | { type: 'pr.ERROR'; message: string }
  | { type: 'pr.STATUS_CHANGED'; data: { timestamp: Date } }

export interface Context {
  gitRepository: GitRepository | null
}

export type Event = 
  | { type: 'pr.GET_BASE_BRANCH' }
  | { type: 'pr.GET_BRANCH_DIFF'; baseBranch?: string }
  | { type: 'pr.GET_BRANCH_FILE_DIFF'; path: string; baseBranch: string }
  | { type: 'pr.GIT_STATUS_CHANGED' }
  | { type: 'pr.UPDATE_ROOT_DIRECTORY'; path: string; gitRepository: GitRepository };

export const pullRequestSystem = setup({
  types: {
    context: {} as Context,
    events: {} as Event,
    input: {} as { rootDirectory: string | null; gitRepository?: GitRepository | null }
  },
  actions: {
    getBaseBranch: async ({ context }) => {
      if (!requireGitRepository(context)) return
      
      try {
        const { gitRepository } = context
        
        const branch = await gitRepository.getPRBaseBranch()
        const wrapped = emit(pluginId, {
          type: 'pr.BASE_BRANCH_RECEIVED',
          data: { branch }
        })
        rootEvents.emitOutgoing(wrapped.event)
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'pr.ERROR',
          message: error.message
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    getBranchDiff: async ({ event, context }) => {
      const ev = event as { type: 'pr.GET_BRANCH_DIFF'; baseBranch?: string }
      
      if (!requireGitRepository(context)) return
      
      try {
        const { gitRepository } = context
        
        const baseBranch = ev.baseBranch || await gitRepository.getPRBaseBranch()
        const files = await gitRepository.getBranchDiff(baseBranch)
        const wrapped = emit(pluginId, {
          type: 'pr.BRANCH_DIFF_RECEIVED',
          data: { files, baseBranch }
        })
        rootEvents.emitOutgoing(wrapped.event)
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'pr.ERROR',
          message: error.message
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    getBranchFileDiff: async ({ event, context }) => {
      const ev = event as { type: 'pr.GET_BRANCH_FILE_DIFF'; path: string; baseBranch: string }
      
      if (!requireGitRepository(context)) return
      
      try {
        const { gitRepository } = context
        
        const diff = await gitRepository.getFileDiffBetweenBranches(ev.path, ev.baseBranch)

        // Get file content from both branches
        const originalContent = await gitRepository.getFileContentFromBranch(ev.path, ev.baseBranch)
        const modifiedContent = await gitRepository.getFileContentFromBranch(ev.path, 'HEAD')

        const wrapped = emit(pluginId, {
          type: 'pr.FILE_DIFF_RECEIVED',
          data: {
            path: ev.path,
            diff,
            staged: false,
            originalContent,
            modifiedContent
          }
        })
        rootEvents.emitOutgoing(wrapped.event)
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'pr.ERROR',
          message: error.message
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    handleGitStatusChanged: async ({ self }) => {
      // When git status changes, send PR status update event to frontend
      const wrapped = emit(pluginId, {
        type: 'pr.STATUS_CHANGED',
        data: { timestamp: new Date() }
      })
      rootEvents.emitOutgoing(wrapped.event)
    },

    updateRootDirectory: assign({
      gitRepository: ({ event }) => {
        const ev = event as { type: 'pr.UPDATE_ROOT_DIRECTORY'; path: string; gitRepository: GitRepository }
        return ev.gitRepository
      }
    })
  }
}).createMachine({
  id: 'pull-request',
  initial: 'idle',
  context: ({ input }) => ({
    gitRepository: input?.gitRepository || (input?.rootDirectory ? new GitRepository(input.rootDirectory) : null)
  }),
  states: {
    idle: {
      on: {
        'pr.GET_BASE_BRANCH': {
          actions: 'getBaseBranch'
        },
        'pr.GET_BRANCH_DIFF': {
          actions: 'getBranchDiff'
        },
        'pr.GET_BRANCH_FILE_DIFF': {
          actions: 'getBranchFileDiff'
        },
        'pr.GIT_STATUS_CHANGED': {
          actions: 'handleGitStatusChanged'
        },
        'pr.UPDATE_ROOT_DIRECTORY': {
          actions: 'updateRootDirectory'
        }
      }
    }
  }
})