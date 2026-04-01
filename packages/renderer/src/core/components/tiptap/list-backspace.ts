import { Extension, isAtStartOfNode, isNodeActive } from '@tiptap/core'

const LIST_ITEMS = ['listItem', 'taskItem']
const LIST_TYPES = ['bulletList', 'orderedList', 'taskList']

export const ListBackspace = Extension.create({
  name: 'listBackspace',
  addKeyboardShortcuts() {
    const handleBackspace = () => {
      const { editor } = this
      const { selection } = editor.state

      if (!selection.empty) return false

      // Case 1: inside a list item at start — undo input rule or lift out
      for (const name of LIST_ITEMS) {
        if (!editor.state.schema.nodes[name]) continue
        if (!isNodeActive(editor.state, name)) continue
        if (!isAtStartOfNode(editor.state)) continue

        if (editor.commands.undoInputRule()) return true
        return editor.chain().liftListItem(name).run()
      }

      // Case 2: cursor at start of block right after a list — merge into last item
      const { $from } = selection
      if ($from.parentOffset !== 0) return false

      const posBefore = $from.before($from.depth)
      if (posBefore <= 0) return false

      const listNode = editor.state.doc.resolve(posBefore).nodeBefore
      if (!listNode || !LIST_TYPES.includes(listNode.type.name)) return false

      // Find last list item's position via descendants
      const listItemPositions: number[] = []
      listNode.descendants((node, pos) => {
        if (LIST_ITEMS.includes(node.type.name)) {
          listItemPositions.push(pos)
        }
      })
      const lastItemPos = listItemPositions.at(-1)
      if (lastItemPos == null) return false

      const listStartPos = posBefore - listNode.nodeSize
      const $lastItem = editor.state.doc.resolve(listStartPos + 1 + lastItemPos + 1)

      // Cut paragraph into last list item and join text (keeps the bullet)
      editor
        .chain()
        .cut({ from: $from.start() - 1, to: $from.end() + 1 }, $lastItem.end())
        .joinForward()
        .run()

      return true
    }

    return {
      Backspace: handleBackspace,
      'Mod-Backspace': handleBackspace,
    }
  },
})
