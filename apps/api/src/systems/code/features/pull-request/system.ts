import { setup } from 'xstate'
import { emit } from '@/core/utils/actor-helpers'
import { rootEvents } from '@/core/router/bus-emitter'
import { systemBus } from '@/core/utils/event-helpers'
import { z } from 'zod'
import { GitRepository } from '../../services/git'
import { GitStatusFile, GitDiff } from '../../types'

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
  | { type: 'pr.BASE_BRANCH'; data: { branch: string } }
  | { type: 'pr.BRANCH_DIFF'; data: { files: GitStatusFile[]; baseBranch: string } }
  | { type: 'pr.BRANCH_FILE_DIFF'; data: GitDiff }
  | { type: 'pr.ERROR'; data: { message: string } }
  | { type: 'pr.STATUS_CHANGED'; data: { timestamp: Date } }

export interface Context {
  // We'll get gitRepository from commit system via parent
}

export type Event = 
  | { type: 'pr.GET_BASE_BRANCH' }
  | { type: 'pr.GET_BRANCH_DIFF'; baseBranch?: string }
  | { type: 'pr.GET_BRANCH_FILE_DIFF'; path: string; baseBranch: string }
  | { type: 'pr.GIT_STATUS_CHANGED' };

export const pullRequestSystem = setup({
  types: {
    context: {} as Context,
    events: {} as Event
  },
  actions: {
    getBaseBranch: async ({ system }) => {
      try {
        // Get git repository from commit system via parent
        const commitSystem = system.get('commit') as any
        const gitRepository = commitSystem?.getSnapshot()?.context?.gitRepository
        
        if (!gitRepository) {
          throw new Error('Git repository not available')
        }
        
        const branch = await gitRepository.getPRBaseBranch()
        const wrapped = emit(pluginId, {
          type: 'pr.BASE_BRANCH',
          data: { branch }
        })
        rootEvents.emitOutgoing(wrapped.event)
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'commit.GIT_ERROR',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    getBranchDiff: async ({ event, system }) => {
      const ev = event as { type: 'pr.GET_BRANCH_DIFF'; baseBranch?: string }
      try {
        // Get git repository from commit system via parent
        const commitSystem = system.get('commit') as any
        const gitRepository = commitSystem?.getSnapshot()?.context?.gitRepository
        
        if (!gitRepository) {
          throw new Error('Git repository not available')
        }
        
        const baseBranch = ev.baseBranch || await gitRepository.getPRBaseBranch()
        const files = await gitRepository.getBranchDiff(baseBranch)
        const wrapped = emit(pluginId, {
          type: 'pr.BRANCH_DIFF',
          data: { files, baseBranch }
        })
        rootEvents.emitOutgoing(wrapped.event)
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'commit.GIT_ERROR',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    getBranchFileDiff: async ({ event, system }) => {
      const ev = event as { type: 'pr.GET_BRANCH_FILE_DIFF'; path: string; baseBranch: string }
      try {
        // Get git repository from commit system via parent
        const commitSystem = system.get('commit') as any
        const gitRepository = commitSystem?.getSnapshot()?.context?.gitRepository
        
        if (!gitRepository) {
          throw new Error('Git repository not available')
        }
        
        const diff = await gitRepository.getFileDiffBetweenBranches(ev.path, ev.baseBranch)

        // Get file content from both branches
        const originalContent = await gitRepository.getFileContentFromBranch(ev.path, ev.baseBranch)
        const modifiedContent = await gitRepository.getFileContentFromBranch(ev.path, 'HEAD')

        const wrapped = emit(pluginId, {
          type: 'pr.BRANCH_FILE_DIFF',
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
          type: 'commit.GIT_ERROR',
          data: { message: error.message }
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
    }
  }
}).createMachine({
  id: 'pull-request',
  initial: 'idle',
  context: {},
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
        }
      }
    }
  }
})