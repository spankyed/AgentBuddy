import { assign, setup } from 'xstate'
import { emit } from '@/core/shared/actor-helpers'
import { rootEvents } from '@/core/router/bus-emitter'
import { FileSystemRepository } from '../services/filesystem'
import { SearchOptions, SearchResult, SearchProgress } from '../types'

const pluginId = 'code' as const

// Incoming events from frontend
export type IncomingSearchEvents =
  | { type: 'search.SEARCH_FILES'; query: string; path: string; includePattern?: string; excludePattern?: string; caseSensitive?: boolean; wholeWord?: boolean; useRegex?: boolean; maxResults?: number }
  | { type: 'search.CANCEL_SEARCH' }

// Outgoing events to frontend
export type OutgoingSearchEvents =
  | { type: 'search.RESULT'; data: SearchResult }
  | { type: 'search.PROGRESS'; data: SearchProgress }
  | { type: 'search.COMPLETE'; data: { results: SearchResult[]; totalMatches: number } }
  | { type: 'search.ERROR'; data: { message: string } }

export interface Context {
  repository: FileSystemRepository | null
  activeSearchController?: AbortController
}

export type Event = 
  | { type: 'search.SEARCH_FILES'; 
      query: string;
      path: string;
      includePattern?: string;
      excludePattern?: string;
      caseSensitive?: boolean;
      wholeWord?: boolean;
      useRegex?: boolean;
      maxResults?: number;
    }
  | { type: 'search.CANCEL_SEARCH' }
  | { type: 'search.ASSIGN_SEARCH_CONTROLLER'; controller: AbortController }
  | { type: 'search.CLEAR_SEARCH_CONTROLLER' }
  | { type: 'search.UPDATE_BASE_DIRECTORY'; path: string };

export const searchSystem = setup({
  types: {
    context: {} as Context,
    events: {} as Event,
    input: {} as { baseDirectory: string | null },
  },
  actions: {
    searchFiles: async ({ event, context, self }) => {
      const ev = event as { 
        type: 'search.SEARCH_FILES'; 
        query: string;
        path: string;
        includePattern?: string;
        excludePattern?: string;
        caseSensitive?: boolean;
        wholeWord?: boolean;
        useRegex?: boolean;
        maxResults?: number;
      }

      if (!context.repository) {
        const wrapped = emit(pluginId, {
          type: 'search.ERROR',
          data: { message: 'No directory selected. Please select a directory first.' }
        })
        rootEvents.emitOutgoing(wrapped.event)
        return
      }

      // Cancel any existing search
      if (context.activeSearchController) {
        context.activeSearchController.abort()
      }

      // Create new abort controller
      const controller = new AbortController()
      self.send({ type: 'search.ASSIGN_SEARCH_CONTROLLER', controller })

      try {
        const searchOptions: SearchOptions = {
          query: ev.query,
          path: ev.path,
          includePattern: ev.includePattern,
          excludePattern: ev.excludePattern,
          caseSensitive: ev.caseSensitive,
          wholeWord: ev.wholeWord,
          useRegex: ev.useRegex,
          maxResults: ev.maxResults
        }

        let totalMatches = 0

        const results = await context.repository.searchFiles(
          searchOptions,
          // Progress callback
          (filesSearched, totalFiles, currentFile) => {
            if (!controller.signal.aborted) {
              const wrapped = emit(pluginId, {
                type: 'search.PROGRESS',
                data: { filesSearched, totalFiles, currentFile }
              })
              rootEvents.emitOutgoing(wrapped.event)
            }
          },
          // Result callback (incremental results)
          (result) => {
            if (!controller.signal.aborted) {
              totalMatches += result.matches.length
              const wrapped = emit(pluginId, {
                type: 'search.RESULT',
                data: result
              })
              rootEvents.emitOutgoing(wrapped.event)
            }
          }
        )

        if (!controller.signal.aborted) {
          const wrapped = emit(pluginId, {
            type: 'search.COMPLETE',
            data: { results, totalMatches }
          })
          rootEvents.emitOutgoing(wrapped.event)
        }
      } catch (error: any) {
        if (!controller.signal.aborted) {
          const wrapped = emit(pluginId, {
            type: 'search.ERROR',
            data: { message: error.message }
          })
          rootEvents.emitOutgoing(wrapped.event)
        }
      } finally {
        self.send({ type: 'search.CLEAR_SEARCH_CONTROLLER' })
      }
    },

    cancelSearch: ({ context }) => {
      if (context.activeSearchController) {
        context.activeSearchController.abort()
      }
    },

    assignSearchController: assign({
      activeSearchController: ({ event }) => {
        const ev = event as { type: 'search.ASSIGN_SEARCH_CONTROLLER'; controller: AbortController }
        return ev.controller
      }
    }),

    clearSearchController: assign({
      activeSearchController: undefined
    }),

    updateBaseDirectory: assign({
      repository: ({ event }) => {
        const ev = event as { type: 'search.UPDATE_BASE_DIRECTORY'; path: string }
        return new FileSystemRepository(ev.path)
      }
    }),
  }
}).createMachine({
  id: 'search',
  initial: 'idle',
  context: ({ input }: { input?: { baseDirectory: string | null } }) => ({
    repository: input?.baseDirectory ? new FileSystemRepository(input.baseDirectory) : null,
    activeSearchController: undefined
  }),
  states: {
    idle: {
      on: {
        'search.SEARCH_FILES': {
          actions: 'searchFiles'
        },
        'search.CANCEL_SEARCH': {
          actions: 'cancelSearch'
        },
        'search.ASSIGN_SEARCH_CONTROLLER': {
          actions: 'assignSearchController'
        },
        'search.CLEAR_SEARCH_CONTROLLER': {
          actions: 'clearSearchController'
        },
        'search.UPDATE_BASE_DIRECTORY': {
          actions: 'updateBaseDirectory'
        }
      }
    }
  }
})