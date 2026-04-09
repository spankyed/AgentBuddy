import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const uploadPlaceholderKey = new PluginKey('imageUploadPlaceholder')

interface PlaceholderState {
  decorations: DecorationSet
}

export const ImageUploadPlaceholder = Extension.create({
  name: 'imageUploadPlaceholder',

  addProseMirrorPlugins() {
    return [
      new Plugin<PlaceholderState>({
        key: uploadPlaceholderKey,
        state: {
          init() {
            return { decorations: DecorationSet.empty }
          },
          apply(tr, state) {
            let decorations = state.decorations.map(tr.mapping, tr.doc)

            const action = tr.getMeta(uploadPlaceholderKey)
            if (action?.type === 'add') {
              const widget = document.createElement('div')
              widget.className = 'image-upload-placeholder'
              const img = document.createElement('img')
              img.src = action.src
              widget.appendChild(img)
              const spinner = document.createElement('div')
              spinner.className = 'image-upload-spinner'
              widget.appendChild(spinner)

              const deco = Decoration.widget(action.pos, widget, { id: action.id })
              decorations = decorations.add(tr.doc, [deco])
            } else if (action?.type === 'remove') {
              decorations = decorations.remove(
                decorations.find(undefined, undefined, (spec) => spec.id === action.id)
              )
            }

            return { decorations }
          },
        },
        props: {
          decorations(state) {
            return uploadPlaceholderKey.getState(state)?.decorations ?? DecorationSet.empty
          },
        },
      }),
    ]
  },
})

export function addUploadPlaceholder(view: import('@tiptap/pm/view').EditorView, id: string, pos: number, src: string) {
  const tr = view.state.tr.setMeta(uploadPlaceholderKey, { type: 'add', id, pos, src })
  view.dispatch(tr)
}

export function removeUploadPlaceholder(view: import('@tiptap/pm/view').EditorView, id: string) {
  const tr = view.state.tr.setMeta(uploadPlaceholderKey, { type: 'remove', id })
  view.dispatch(tr)
}
