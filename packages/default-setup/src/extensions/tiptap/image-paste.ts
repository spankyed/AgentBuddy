import { Plugin } from '@tiptap/pm/state'
import { extractImageSrcsFromClipboard } from '#features/threads/fe/chat/composables/useAttachments.ts'

/**
 * Image-URL paste (e.g. from notes) inside ProseMirror's pipeline.
 *
 * A factory rather than an `Extension`, because what it does with a pasted URL belongs to whichever
 * editor registered it: the chat input adds an attachment. `editor.registerPlugin()` is tiptap's own
 * route for a plugin bound to a component's lifetime, so there is no extension for this one to be
 * private to — the module is the boundary instead.
 */
export function imagePaste(addImageFromUrl: (src: string) => void): Plugin {
  return new Plugin({
    props: {
      handlePaste(_view, event) {
        if (!event.clipboardData) return false
        // Skip raw image blobs — handled by the outer @paste handler
        for (const item of event.clipboardData.items) {
          if (item.type.startsWith('image/')) return false
        }
        const srcs = extractImageSrcsFromClipboard(event.clipboardData)
        if (!srcs.length) return false
        for (const src of srcs) addImageFromUrl(src)
        return true
      },
    },
  })
}
