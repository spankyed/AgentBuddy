import { Extension } from '@tiptap/core'
import { commandSuggestionPlugin } from './command-suggestion-plugin'
import { applicationState } from '@/main'
import { id as threadsId } from '@/plugins/threads/state'
import type { CommandItem } from './command-config'

export const CommandSuggestion = Extension.create({
  name: 'commandSuggestion',
  addProseMirrorPlugins() {
    const getCommands = (): CommandItem[] => {
      const actor = applicationState.system.get(threadsId)
      const snap = actor?.getSnapshot()
      return (snap?.context as any)?.commands ?? []
    }
    return [commandSuggestionPlugin(this.editor, getCommands)]
  },
})
