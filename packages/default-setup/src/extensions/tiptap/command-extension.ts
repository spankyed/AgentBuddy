import { Extension } from '@tiptap/core'
import { commandSuggestionPlugin } from './command-suggestion-plugin.ts'
import { readSurfaceState } from '#generated/fe.ts'

export const CommandSuggestion = Extension.create({
  name: 'commandSuggestion',
  addProseMirrorPlugins() {
    return [commandSuggestionPlugin(this.editor, () => readSurfaceState('threads', (s) => s.commands))]
  },
})
