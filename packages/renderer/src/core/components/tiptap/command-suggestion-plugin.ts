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
          // Deactivate if the / was deleted
          if (!textBefore.startsWith('/')) {
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

        // Show placeholder when command is selected and no body text yet
        const docText = state.doc.textContent
        const commandPrefix = `/${pluginState.selectedCommand.name} `

        // Only show placeholder if text is exactly the command prefix (or just the command name with trailing space)
        if (!docText.startsWith(commandPrefix) && docText !== `/${pluginState.selectedCommand.name}`) {
          // User has typed body text, no placeholder needed
          if (docText.length > commandPrefix.length) return DecorationSet.empty
        }

        // Check if there's content after the command prefix
        const bodyText = docText.slice(commandPrefix.length).trim()
        if (bodyText) return DecorationSet.empty

        // Place widget decoration at end of content
        const pos = state.doc.content.size - 1
        const widget = Decoration.widget(pos, () => {
          const span = document.createElement('span')
          span.textContent = pluginState.selectedCommand!.placeholder
          span.style.color = 'rgb(115 115 115)'
          span.style.pointerEvents = 'none'
          span.style.userSelect = 'none'
          return span
        }, { side: 1 })

        return DecorationSet.create(state.doc, [widget])
      },
    },
  })
}
