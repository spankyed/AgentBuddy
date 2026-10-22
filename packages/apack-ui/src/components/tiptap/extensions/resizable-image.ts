import Image from '@tiptap/extension-image'
import { mergeAttributes } from '@tiptap/core'

export function getWidthFromSrc(src: string | null | undefined): number | null {
  if (!src) return null
  try {
    const url = new URL(src)
    const w = url.searchParams.get('w')
    if (w) {
      const n = Number(w)
      return Number.isFinite(n) && n > 0 && n <= 100 ? n : null
    }
    return null
  } catch { return null }
}

export function setSrcWidth(src: string, pct: number): string {
  try {
    const url = new URL(src)
    if (pct >= 100) url.searchParams.delete('w')
    else url.searchParams.set('w', String(pct))
    return url.toString()
  } catch { return src }
}

export const ResizableImage = Image.extend({
  renderHTML({ HTMLAttributes }) {
    const width = getWidthFromSrc(HTMLAttributes.src)
    const attrs = { ...HTMLAttributes }
    if (width) attrs.style = `width: ${width}%`
    return ['img', mergeAttributes(this.options.HTMLAttributes, attrs)]
  },
})
