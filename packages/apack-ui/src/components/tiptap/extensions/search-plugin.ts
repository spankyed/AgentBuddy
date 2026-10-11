import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node } from '@tiptap/pm/model'

export interface SearchMatch {
  from: number
  to: number
}

export interface SearchPluginState {
  isOpen: boolean
  query: string
  matches: SearchMatch[]
  currentIndex: number
}

type SearchMeta =
  | { open: true }
  | { close: true }
  | { query: string }
  | { nextMatch: true }
  | { prevMatch: true }

const defaultState: SearchPluginState = {
  isOpen: false,
  query: '',
  matches: [],
  currentIndex: 0,
}

export const searchPluginKey = new PluginKey<SearchPluginState>('search')

function findMatches(doc: Node, query: string): SearchMatch[] {
  if (!query) return []
  const results: SearchMatch[] = []
  const lowerQuery = query.toLowerCase()
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const text = node.text.toLowerCase()
    let index = 0
    let found: number
    while ((found = text.indexOf(lowerQuery, index)) !== -1) {
      results.push({ from: pos + found, to: pos + found + query.length })
      index = found + 1
    }
  })
  return results
}

function clampIndex(index: number, length: number): number {
  if (length === 0) return 0
  return ((index % length) + length) % length
}

export function searchPlugin(): Plugin<SearchPluginState> {
  return new Plugin<SearchPluginState>({
    key: searchPluginKey,

    state: {
      init(): SearchPluginState {
        return { ...defaultState }
      },

      apply(tr, prev): SearchPluginState {
        const meta = tr.getMeta(searchPluginKey) as SearchMeta | undefined

        if (meta) {
          if ('close' in meta) return { ...defaultState }

          if ('open' in meta) {
            // Re-open with previous query preserved (highlights re-appear)
            const matches = prev.query ? findMatches(tr.doc, prev.query) : []
            return {
              isOpen: true,
              query: prev.query,
              matches,
              currentIndex: clampIndex(prev.currentIndex, matches.length),
            }
          }

          if ('query' in meta) {
            const matches = findMatches(tr.doc, meta.query)
            return {
              isOpen: true,
              query: meta.query,
              matches,
              currentIndex: 0,
            }
          }

          if ('nextMatch' in meta) {
            return {
              ...prev,
              currentIndex: clampIndex(prev.currentIndex + 1, prev.matches.length),
            }
          }

          if ('prevMatch' in meta) {
            return {
              ...prev,
              currentIndex: clampIndex(prev.currentIndex - 1, prev.matches.length),
            }
          }
        }

        // Re-compute matches when the document changes while a query is active
        if (tr.docChanged && prev.isOpen && prev.query) {
          const matches = findMatches(tr.doc, prev.query)
          return {
            ...prev,
            matches,
            currentIndex: clampIndex(prev.currentIndex, matches.length),
          }
        }

        return prev
      },
    },

    props: {
      handleKeyDown(view, event) {
        if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key === 'f') {
          event.preventDefault()
          view.dispatch(view.state.tr.setMeta(searchPluginKey, { open: true } as SearchMeta))
          return true
        }
        return false
      },

      decorations(state) {
        const pluginState = searchPluginKey.getState(state)
        if (!pluginState || !pluginState.isOpen || pluginState.matches.length === 0) {
          return DecorationSet.empty
        }

        const decorations = pluginState.matches.map((match, i) =>
          Decoration.inline(match.from, match.to, {
            class: i === pluginState.currentIndex
              ? 'search-highlight search-highlight-current'
              : 'search-highlight',
          }),
        )

        return DecorationSet.create(state.doc, decorations)
      },
    },
  })
}
