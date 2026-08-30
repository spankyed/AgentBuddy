import { Extension } from '@tiptap/core'
import { commandSuggestionPlugin } from './command-suggestion-plugin'
import { getEditorSystem } from './editor-system'
import { threadsId } from '@/registries/extensions'
import type { CommandItem } from './command-config'

export const CommandSuggestion = Extension.create({
  name: 'commandSuggestion',
  addProseMirrorPlugins() {
    const getCommands = (): CommandItem[] => {
      const actor = getEditorSystem().get(threadsId)
      const snap = actor?.getSnapshot()
      return (snap?.context as any)?.commands ?? []
    }
    return [commandSuggestionPlugin(this.editor, getCommands)]
  },
})
