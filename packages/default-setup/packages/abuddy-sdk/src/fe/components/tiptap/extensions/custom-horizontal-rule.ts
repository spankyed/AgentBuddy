import HorizontalRule from '@tiptap/extension-horizontal-rule'
import { InputRule } from '@tiptap/core'

export const CustomHorizontalRule = HorizontalRule.extend({
  addInputRules() {
    return [
      ...(this.parent?.() ?? []),
      new InputRule({
        find: /^___\s$/,
        handler: ({ range, chain }) => {
          chain().deleteRange(range).setHorizontalRule().run()
        },
      }),
      new InputRule({
        find: /^\*\*\*\s$/,
        handler: ({ range, chain }) => {
          chain().deleteRange(range).setHorizontalRule().run()
        },
      }),
    ]
  },
})
