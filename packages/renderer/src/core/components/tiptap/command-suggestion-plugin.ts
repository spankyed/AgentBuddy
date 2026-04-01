import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
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

        // Use first paragraph text — the `/` and query are always in the first paragraph
        const firstParagraph = tr.doc.firstChild
        if (!firstParagraph) return prev.active ? { ...defaultState } : prev

        const firstText = firstParagraph.textContent

        // Only activate when / is the very first character
        if (!firstText.startsWith('/')) {
          return prev.active ? { ...defaultState } : prev
        }

        const { $head } = tr.selection
        const isFirstParagraph = $head.depth === 1 && $head.index(0) === 0
        if (!isFirstParagraph && !prev.active) return prev

        // triggerPos is always the start of first paragraph content
        const triggerPos = 1

        // If a command is already selected, stay active while prefix is intact
        if (prev.active && prev.selectedCommand) {
          const requiredPrefix = `/${prev.selectedCommand.name} `
          if (firstText.startsWith(requiredPrefix)) return prev
          // Prefix broken — re-enter query phase with the partial command text
          const partialQuery = firstText.slice(1).split(' ')[0]
          return { ...prev, active: true, triggerPos, query: partialQuery, selectedCommand: null }
        }

        // Query phase: extract text after `/`, deactivate if it contains a space
        const query = firstText.slice(1)

        if (query.trim().length === 0) {
          return { ...prev, active: true, triggerPos, query: '' }
        }

        if (query.includes(' ')) {
          return prev.active ? { ...defaultState } : prev
        }

        return {
          ...prev,
          active: true,
          triggerPos,
          query,
        }
      },
    },

    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some(tr => tr.docChanged)) return null

      const firstText = newState.doc.firstChild?.textContent ?? ''
      if (!firstText.startsWith('/')) return null

      const pluginState = commandSuggestionPluginKey.getState(newState)

      // Strip trailing whitespace when in query phase (no selected command)
      if (newState.doc.childCount === 1 && pluginState?.active && !pluginState.selectedCommand) {
        const trimmed = firstText.trimEnd()
        if (trimmed !== firstText && trimmed.length > 0) {
          const { tr } = newState
          const firstChild = newState.doc.firstChild!
          const paragraph = newState.schema.nodes.paragraph.create(
            null,
            newState.schema.text(trimmed),
          )
          tr.replaceWith(0, firstChild.nodeSize, paragraph)
          tr.setSelection(TextSelection.atEnd(tr.doc))
          return tr
        }
      }

      // Only act when doc has multiple paragraphs
      if (newState.doc.childCount <= 1) return null

      // Everything outside the first paragraph must be whitespace-only
      const docText = newState.doc.textContent
      const rest = docText.slice(firstText.length)
      if (rest.trim().length > 0) return null

      // Collapse to single paragraph with just the first paragraph's content
      const { tr } = newState
      const paragraph = newState.schema.nodes.paragraph.create(
        null,
        firstText ? newState.schema.text(firstText) : null,
      )
      tr.replaceWith(0, newState.doc.content.size, paragraph)
      tr.setSelection(TextSelection.atEnd(tr.doc))
      return tr
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
        const cmdStart = pluginState.triggerPos
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
