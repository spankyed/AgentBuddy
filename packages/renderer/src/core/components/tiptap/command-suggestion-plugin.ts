import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Editor } from '@tiptap/core'
import type { CommandItem } from './command-config'

export interface CommandSuggestionState {
  active: boolean
  triggerPos: number
  query: string
  selectedCommand: CommandItem | null
}

const defaultState: CommandSuggestionState = {
  active: false,
  triggerPos: 0,
  query: '',
  selectedCommand: null,
}

export const commandSuggestionPluginKey = new PluginKey<CommandSuggestionState>('commandSuggestion')

export function commandSuggestionPlugin(editor: Editor): Plugin<CommandSuggestionState> {
  return new Plugin<CommandSuggestionState>({
    key: commandSuggestionPluginKey,

    state: {
      init() {
        return { ...defaultState }
      },

      apply(tr, prev) {
        // Handle explicit meta updates (from popup interactions)
        const meta = tr.getMeta(commandSuggestionPluginKey)
        if (meta) {
          if (meta.deactivate) return { ...defaultState }
          return { ...prev, ...meta }
        }

        if (!editor.isEditable) return { ...defaultState }

        if (!tr.docChanged && !tr.selectionSet) return prev

        const { $head } = tr.selection

        // Get the full document text content
        const docText = tr.doc.textContent

        // Only activate when / is the very first character in the document
        if (!docText.startsWith('/')) {
          return prev.active ? { ...defaultState } : prev
        }

        const textBefore = $head.parent.textBetween(0, $head.parentOffset, undefined, '\ufffc')

        // Find / at start of the first paragraph
        const isFirstParagraph = $head.depth === 1 && $head.index(0) === 0
        if (!isFirstParagraph && !prev.active) {
          return prev
        }

        // For first paragraph, check that / is at position 0
        const slashIndex = 0
        const afterSlash = textBefore.slice(slashIndex + 1)

        // If a command is already selected, stay active (user is typing the body)
        if (prev.active && prev.selectedCommand) {
          const requiredPrefix = `/${prev.selectedCommand.name} `
          // Deactivate if the command prefix (including space separator) was broken
          if (!docText.startsWith(requiredPrefix)) {
            return { ...defaultState }
          }
          return prev
        }

        // During query phase: deactivate if space in query (no command selected yet)
        if (afterSlash.includes(' ')) {
          return prev.active ? { ...defaultState } : prev
        }

        // Calculate trigger position
        const start = $head.start()
        const triggerPos = start + slashIndex

        return {
          ...prev,
          active: true,
          triggerPos,
          query: afterSlash,
        }
      },
    },

    props: {
      decorations(state) {
        const pluginState = commandSuggestionPluginKey.getState(state)
        if (!pluginState?.active || !pluginState.selectedCommand) return DecorationSet.empty

        const docText = state.doc.textContent
        const commandPrefix = `/${pluginState.selectedCommand.name}`

        // Only show placeholder if there's no body text after the command
        const afterCommand = docText.slice(commandPrefix.length).replace(/^\s/, '')
        if (afterCommand) return DecorationSet.empty

        // Apply a node decoration on the first paragraph with the placeholder as a data attribute
        const firstChild = state.doc.firstChild
        if (!firstChild) return DecorationSet.empty

        const deco = Decoration.node(0, firstChild.nodeSize, {
          'data-command-placeholder': pluginState.selectedCommand.placeholder,
          'class': 'has-command-placeholder',
        })

        return DecorationSet.create(state.doc, [deco])
      },
    },
  })
}
