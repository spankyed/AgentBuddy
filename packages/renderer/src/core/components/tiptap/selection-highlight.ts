import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const SelectionHighlight = Extension.create({
  name: 'selectionHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('selectionHighlight'),
        props: {
          decorations(state) {
            const { selection } = state
            if (selection.empty) return DecorationSet.empty

            const decorations: Decoration[] = []
            state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
              if (node.isTextblock) {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: 'selection-highlight',
                  })
                )
                return false
              }
            })
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})
