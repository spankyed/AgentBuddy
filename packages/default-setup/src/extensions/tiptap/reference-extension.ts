import { Extension } from '@tiptap/core'
import { referenceSuggestionPlugin } from './reference-suggestion-plugin.ts'

/** Suggestions use the host's reference node without owning the stored document schema. */
export const ReferenceSuggestion = Extension.create({
  name: 'referenceSuggestion',
  addProseMirrorPlugins() {
    return [referenceSuggestionPlugin(this.editor)]
  },
})
