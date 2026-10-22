import { Plugin } from '@tiptap/pm/state'

/**
 * Image-URL paste (e.g. from notes) inside ProseMirror's pipeline.
 *
 * A factory rather than an `Extension`, because what it does with a pasted URL belongs to whichever
 * editor registered it: the chat input adds an attachment. `editor.registerPlugin()` is tiptap's own
 * route for a plugin bound to a component's lifetime, so there is no extension for this one to be
 * private to — the module is the boundary instead.
 */
/** Extract image URLs from clipboard — tries HTML `<img>` tags, then markdown `![](url)`. */
export function extractImageSrcsFromClipboard(clipboardData: DataTransfer): string[] {
  const html = clipboardData.getData('text/html')
  if (html) {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html')
      const srcs = Array.from(doc.querySelectorAll('img[src]'), img => img.getAttribute('src')!).filter(Boolean)
      if (srcs.length) return srcs
    } catch { /* fall through */ }
  }
  const text = clipboardData.getData('text/plain')
  if (text) {
    const srcs: string[] = []
    let m
    const re = /!\[[^\]]*\]\(([^)]+)\)/g
    while ((m = re.exec(text)) !== null) srcs.push(m[1])
    if (srcs.length) return srcs
  }
  return []
}

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
