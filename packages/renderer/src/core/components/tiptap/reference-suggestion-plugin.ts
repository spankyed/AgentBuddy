import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { Editor } from '@tiptap/core'
import type { ReferenceCategory } from './useReferenceItems'

export interface ReferenceSuggestionState {
  active: boolean
  triggerPos: number
  query: string
  level: 'category' | 'items'
  selectedCategory: ReferenceCategory | null
  categoryQuery: string
  decorationRect: { top: number; left: number; bottom: number } | null
}

const defaultState: ReferenceSuggestionState = {
  active: false,
  triggerPos: 0,
  query: '',
  level: 'category',
  selectedCategory: null,
  categoryQuery: '',
  decorationRect: null,
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
        if (afterHash && !/^[\w-]*$/i.test(afterHash)) {
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
            decorationRect: null,
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

        return {
          ...prev,
          active: true,
          triggerPos,
          query: afterHash,
        }
      },
    },

    props: {
      handleKeyDown(view: EditorView, event: KeyboardEvent) {
        const state = referenceSuggestionPluginKey.getState(view.state)
        if (!state?.active) return false

        // These keys are handled by the popup component via the editor's keydown event
        // We just need to prevent default ProseMirror behavior for navigation keys
        if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(event.key)) {
          // Let the popup handle these - it will call event.preventDefault()
          return false
        }

        return false
      },
    },
  })
}
