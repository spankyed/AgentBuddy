import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/core'
import { CATEGORIES, type ReferenceCategory } from './reference-config'

export interface ReferenceSuggestionState {
  active: boolean
  triggerPos: number
  query: string
  level: 'category' | 'items'
  selectedCategory: ReferenceCategory | null
  categoryQuery: string
}

const defaultState: ReferenceSuggestionState = {
  active: false,
  triggerPos: 0,
  query: '',
  level: 'category',
  selectedCategory: null,
  categoryQuery: '',
}

export const referenceSuggestionPluginKey = new PluginKey<ReferenceSuggestionState>('referenceSuggestion')

export function referenceSuggestionPlugin(editor: Editor): Plugin<ReferenceSuggestionState> {
  return new Plugin<ReferenceSuggestionState>({
    key: referenceSuggestionPluginKey,

    state: {
      init() {
        return { ...defaultState }
      },

      apply(tr, prev) {
        // Handle explicit meta updates (from popup interactions)
        const meta = tr.getMeta(referenceSuggestionPluginKey)
        if (meta) {
          if (meta.deactivate) return { ...defaultState }
          return { ...prev, ...meta }
        }

        // Don't process if editor is not editable
        if (!editor.isEditable) return { ...defaultState }

        // If the document or selection didn't change, keep current state
        if (!tr.docChanged && !tr.selectionSet) return prev

        const { $head } = tr.selection
        const textBefore = $head.parent.textBetween(0, $head.parentOffset, undefined, '\ufffc')

        // Look for # trigger - find the last unescaped # that starts a reference
        const hashIndex = textBefore.lastIndexOf('#')

        if (hashIndex === -1) {
          return prev.active ? { ...defaultState } : prev
        }

        // Text after the # trigger
        const afterHash = textBefore.slice(hashIndex + 1)

        // Exit if there's a space in the query (user typed space to exit)
        if (afterHash.includes(' ')) {
          return prev.active ? { ...defaultState } : prev
        }

        // Exit if non-alphanumeric characters (except hyphen/underscore)
        if (afterHash && !/^[\w:-]*$/i.test(afterHash)) {
          return prev.active ? { ...defaultState } : prev
        }

        // Calculate the absolute position of the # trigger
        const start = $head.start()
        const triggerPos = start + hashIndex

        // If we were tracking a different trigger position, this is a new trigger
        if (prev.active && prev.triggerPos !== triggerPos) {
          return {
            active: true,
            triggerPos,
            query: afterHash,
            level: 'category',
            selectedCategory: null,
            categoryQuery: '',
          }
        }

        // If we're at item level, the query is what comes after the category prefix
        if (prev.active && prev.level === 'items' && prev.selectedCategory) {
          const itemQuery = afterHash.slice(prev.categoryQuery.length)
          return {
            ...prev,
            active: true,
            query: itemQuery,
          }
        }

        // At category level, deactivate if query matches no categories
        if (!prev.active || prev.level === 'category') {
          const categoryCheck = afterHash.endsWith(':') ? afterHash.slice(0, -1) : afterHash
          if (categoryCheck && !CATEGORIES.some(c => c.label.toLowerCase().includes(categoryCheck.toLowerCase()))) {
            return prev.active ? { ...defaultState } : prev
          }
        }

        return {
          ...prev,
          active: true,
          triggerPos,
          query: afterHash,
        }
      },
    },

  })
}
