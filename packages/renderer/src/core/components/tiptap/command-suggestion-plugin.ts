import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Editor } from '@tiptap/core'
import type { CommandItem } from './command-config'

export interface CommandSuggestionState {
  active: boolean
  query: string
  selectedCommand: CommandItem | null
}

/** The `/` trigger is always at ProseMirror position 1 (start of first-paragraph content). */
export const COMMAND_TRIGGER_POS = 1

const defaultState: CommandSuggestionState = {
  active: false,
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
        const deactivateIf = (active: boolean) => active ? { ...defaultState } : prev

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
        if (!firstParagraph) return deactivateIf(prev.active)

        const firstText = firstParagraph.textContent

        // Only activate when / is the very first character
        if (!firstText.startsWith('/')) {
          return deactivateIf(prev.active)
        }

        const { $head } = tr.selection
        const isFirstParagraph = $head.depth === 1 && $head.index(0) === 0
        if (!isFirstParagraph && !prev.active) return prev

        // If a command is already selected, stay active while prefix is intact
        if (prev.active && prev.selectedCommand) {
          const requiredPrefix = `/${prev.selectedCommand.name} `
          if (firstText.startsWith(requiredPrefix)) return prev
          // Prefix broken — re-enter query phase with the partial command text
          const partialQuery = firstText.slice(1).split(' ')[0]
          return { ...prev, active: true, query: partialQuery, selectedCommand: null }
        }

        // Query phase: extract text after `/`, deactivate if it contains a space
        const query = firstText.slice(1)

        if (query.trim().length === 0) {
          return { ...prev, active: true, query: '' }
        }

        if (query.includes(' ')) {
          return deactivateIf(prev.active)
        }

        return {
          ...prev,
          active: true,
          query,
        }
      },
    },

    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some(tr => tr.docChanged)) return null

      const firstText = newState.doc.firstChild?.textContent ?? ''
      if (!firstText.startsWith('/')) return null

      const pluginState = commandSuggestionPluginKey.getState(newState)
      const inQueryPhase = pluginState?.active && !pluginState.selectedCommand

      // Determine desired text: strip trailing whitespace in query phase
      const targetText = inQueryPhase ? firstText.trimEnd() : firstText
      const needsTrim = targetText !== firstText && targetText.length > 0

      // Determine if extra paragraphs should collapse (only if rest is whitespace-only)
      let needsCollapse = false
      if (newState.doc.childCount > 1) {
        const rest = newState.doc.textContent.slice(firstText.length)
        if (rest.trim().length === 0) needsCollapse = true
      }

      if (!needsTrim && !needsCollapse) return null

      // Single paragraph rebuild
      const { tr } = newState
      const paragraph = newState.schema.nodes.paragraph.create(
        null,
        targetText ? newState.schema.text(targetText) : null,
      )
      const replaceEnd = needsCollapse
        ? newState.doc.content.size
        : newState.doc.firstChild!.nodeSize
      tr.replaceWith(0, replaceEnd, paragraph)
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
        const cmdStart = COMMAND_TRIGGER_POS
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
