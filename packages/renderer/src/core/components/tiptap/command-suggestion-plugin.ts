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
        if (!pluginState?.active) return DecorationSet.empty

        const docText = state.doc.textContent
        const commandPrefix = pluginState.selectedCommand
          ? `/${pluginState.selectedCommand.name}`
          : `/${pluginState.query}`

        const decos: Decoration[] = []

        // Inline decoration on the /commandName (or /query) text
        const cmdStart = 1 // position after doc node opening
        const cmdEnd = cmdStart + commandPrefix.length
        if (cmdEnd > cmdStart) {
          decos.push(Decoration.inline(cmdStart, cmdEnd, { class: 'command-segment' }))
        }

        // Only show placeholder if a command is selected and there's no body text after it
        const afterCommand = docText.slice(commandPrefix.length).replace(/^\s/, '')
        if (pluginState.selectedCommand && !afterCommand) {
          const firstChild = state.doc.firstChild
          if (firstChild) {
            decos.push(Decoration.node(0, firstChild.nodeSize, {
              'data-command-placeholder': pluginState.selectedCommand.placeholder,
              'class': 'has-command-placeholder',
            }))
          }
        }

        return DecorationSet.create(state.doc, decos)
      },
    },
  })
}
