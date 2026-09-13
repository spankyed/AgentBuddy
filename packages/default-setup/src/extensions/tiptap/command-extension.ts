import { Extension } from '@tiptap/core'
import { commandSuggestionPlugin } from './command-suggestion-plugin'
import { getEditorSystem } from '@abuddy/ui/components/tiptap/editor-system'
import type { CommandItem } from './command-config'

export const CommandSuggestion = Extension.create({
  name: 'commandSuggestion',
  addProseMirrorPlugins() {
    const getCommands = (): CommandItem[] => {
      const actor = getEditorSystem().get('threads')
      const snap = actor?.getSnapshot()
      return (snap?.context as any)?.commands ?? []
    }
    return [commandSuggestionPlugin(this.editor, getCommands)]
  },
})
