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

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        if (!editor.isActive('blockquote')) return false
        if (editor.state.selection.$head.parent.textContent.length > 0) return false
        return editor.commands.liftEmptyBlock()
      },
    }
  },
})
