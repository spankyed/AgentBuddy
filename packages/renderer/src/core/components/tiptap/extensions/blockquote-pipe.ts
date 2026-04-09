import Blockquote from '@tiptap/extension-blockquote'
import { wrappingInputRule } from '@tiptap/core'

export const BlockquotePipe = Blockquote.extend({
  addInputRules() {
    return [
      wrappingInputRule({
        find: /^\s*\|\s$/,
        type: this.type,
      }),
    ]
  },
})
