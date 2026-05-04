import { Extension } from '@tiptap/core'
import { Plugin, NodeSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

const SEL_CLASS = 'image-in-selection'

export const ImageSelectionDecoration = Extension.create({
  name: 'imageSelectionDecoration',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const { selection, doc } = state
            if (selection.empty || selection instanceof NodeSelection) return DecorationSet.empty

            const decorations: Decoration[] = []
            doc.nodesBetween(selection.from, selection.to, (node, pos) => {
              if (node.type.name === 'image') {
                decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: SEL_CLASS }))
              }
            })

            return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty
          },
        },
      }),
    ]
  },
})
