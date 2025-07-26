import { setup, assign } from 'xstate';
import { trpc } from '@/core/trpc';
import { getParentContext } from '../../utils/parent-communication';

// Search types
export interface SearchMatch {
  line: number
  column: number
  lineText: string
  matchStart: number
  matchEnd: number
}

export interface SearchResult {
  path: string
  matches: SearchMatch[]
  fileSize?: number
}

export interface SearchProgress {
  filesSearched: number
  totalFiles: number
  currentFile?: string
}

const sendToBackend = (type: string, data: any) => {
  trpc.bus.send.mutate({
    systemId: 'code' as any,
    type: type as any,
    ...data
  } as any)
}

export interface Context {
  searchQuery: string
  searchResults: SearchResult[]
  isSearching: boolean
  searchError: string | null
  searchProgress: SearchProgress | null
  searchOptions: {
    includePattern: string
    excludePattern: string
    caseSensitive: boolean
    wholeWord: boolean
    useRegex: boolean
    searchInCurrentDir: boolean
  }
}

export type Event = 
  | { type: 'search.START'; query: string }
  | { type: 'search.CANCEL' }
  | { type: 'search.CLEAR' }
  | { type: 'search.UPDATE_OPTIONS'; options: Partial<Context['searchOptions']> }
  | { type: 'search.RESULT'; data: SearchResult }
  | { type: 'search.PROGRESS'; data: SearchProgress }
  | { type: 'search.COMPLETE' }
  | { type: 'search.ERROR'; message: string };

export const searchState = setup({
  types: {
    context: {} as Context,
    events: {} as Event
  },
  actions: {
    startSearch: ({ event, context, self }) => {
      const ev = event as { type: 'search.START'; query: string }
      const parentContext = getParentContext(self)
      
      sendToBackend('search.SEARCH_FILES', {
        query: ev.query,
        path: context.searchOptions.searchInCurrentDir 
          ? parentContext?.currentDirectory 
          : parentContext?.rootDirectory,
        includePattern: context.searchOptions.includePattern || undefined,
        excludePattern: context.searchOptions.excludePattern || undefined,
        caseSensitive: context.searchOptions.caseSensitive,
        wholeWord: context.searchOptions.wholeWord,
        useRegex: context.searchOptions.useRegex
      })
    },
    
    cancelSearch: () => {
      sendToBackend('search.CANCEL_SEARCH', {})
    },
    
    assignSearchQuery: assign({
      searchQuery: ({ event }) => {
        const ev = event as { type: 'search.START'; query: string }
        return ev.query
      },
      isSearching: true,
      searchError: null,
      searchResults: []
    }),
    
    assignSearchResult: assign({
      searchResults: ({ context, event }) => {
        const ev = event as { type: 'search.RESULT'; data: SearchResult }
        return [...context.searchResults, ev.data]
      }
    }),
    
    assignSearchProgress: assign({
      searchProgress: ({ event }) => {
        const ev = event as { type: 'search.PROGRESS'; data: SearchProgress }
        return ev.data
      }
    }),
    
    assignSearchComplete: assign({
      isSearching: false,
      searchProgress: null
    }),
    
    assignSearchError: assign({
      searchError: ({ event }) => {
        const ev = event as { type: 'search.ERROR'; message: string }
        return ev.message
      },
      isSearching: false,
      searchProgress: null
    }),
    
    clearSearch: assign({
      searchQuery: '',
      searchResults: [],
      searchError: null,
      searchProgress: null
    }),
    
    updateSearchOptions: assign({
      searchOptions: ({ context, event }) => {
        const ev = event as { type: 'search.UPDATE_OPTIONS'; options: Partial<Context['searchOptions']> }
        return { ...context.searchOptions, ...ev.options }
      }
    })
  }
}).createMachine({
  id: 'search',
  initial: 'idle',
  context: {
    searchQuery: '',
    searchResults: [],
    isSearching: false,
    searchError: null,
    searchProgress: null,
    searchOptions: {
      includePattern: '',
      excludePattern: '',
      caseSensitive: false,
      wholeWord: false,
      useRegex: false,
      searchInCurrentDir: false
    }
  },
  states: {
    idle: {
      on: {
        'search.START': {
          actions: ['assignSearchQuery', 'startSearch']
        },
        'search.CANCEL': {
          actions: 'cancelSearch'
        },
        'search.CLEAR': {
          actions: 'clearSearch'
        },
        'search.UPDATE_OPTIONS': {
          actions: 'updateSearchOptions'
        },
        'search.RESULT': {
          actions: 'assignSearchResult'
        },
        'search.PROGRESS': {
          actions: 'assignSearchProgress'
        },
        'search.COMPLETE': {
          actions: 'assignSearchComplete'
        },
        'search.ERROR': {
          actions: 'assignSearchError'
        }
      }
    }
  }
});