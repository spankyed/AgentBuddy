import { Extension } from '@tiptap/core'
import { commandSuggestionPlugin } from './command-suggestion-plugin'

export const CommandSuggestion = Extension.create({
  name: 'commandSuggestion',
  addProseMirrorPlugins() {
    return [commandSuggestionPlugin(this.editor)]
  },
})
