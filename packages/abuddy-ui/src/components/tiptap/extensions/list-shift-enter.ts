import { Extension, isNodeActive } from '@tiptap/core'

export const ListShiftEnter = Extension.create({
  name: 'listShiftEnter',
  addKeyboardShortcuts() {
    return {
      'Shift-Enter': ({ editor }) => {
        for (const name of ['listItem', 'taskItem']) {
          if (!editor.state.schema.nodes[name]) continue
          if (!isNodeActive(editor.state, name)) continue
          return editor.commands.splitListItem(name)
        }
        return false
      },
    }
  },
})
