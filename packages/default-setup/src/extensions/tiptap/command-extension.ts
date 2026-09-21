import { Extension } from '@tiptap/core'
import { commandSuggestionPlugin } from './command-suggestion-plugin'
import { slashCommands } from '@/features/threads/fe/public'

export const CommandSuggestion = Extension.create({
  name: 'commandSuggestion',
  addProseMirrorPlugins() {
    return [commandSuggestionPlugin(this.editor, slashCommands)]
  },
})
