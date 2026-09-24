import { Extension } from '@tiptap/core'
import { commandSuggestionPlugin } from './command-suggestion-plugin'
import { readPluginState } from '@/__generated__/fe'

export const CommandSuggestion = Extension.create({
  name: 'commandSuggestion',
  addProseMirrorPlugins() {
    return [commandSuggestionPlugin(this.editor, () => readPluginState('threads', (s) => s.commands))]
  },
})
