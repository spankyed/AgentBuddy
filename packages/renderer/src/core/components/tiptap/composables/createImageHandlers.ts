import type { Editor } from '@tiptap/vue-3'

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1]) // strip data URI prefix
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function uploadAndInsertImage(file: File, editor: Editor | undefined, entityId: string | undefined, pos?: number) {
  if (!editor || !entityId) return false
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) return false
  if (file.size > MAX_IMAGE_SIZE) return false

  try {
    const base64 = await fileToBase64(file)
    const url = await window.electronAPI?.media.upload(entityId, base64, file.type)
    if (!url) return false

    if (pos !== undefined) {
      editor.chain().focus().insertContentAt(pos, { type: 'image', attrs: { src: url } }).run()
    } else {
      editor.chain().focus().setImage({ src: url }).run()
    }
    return true
  } catch (err) {
    console.error('Failed to upload image:', err)
    return false
  }
}

export function createImageHandlers(
  getEditor: () => Editor | undefined,
  getEntityId: () => string | undefined,
  isDisabled: () => boolean,
) {
  return {
    handlePaste: (_view: any, event: ClipboardEvent) => {
      if (isDisabled()) return false
      const items = event.clipboardData?.items
      if (!items) return false

      let handled = false
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (!file) continue
          if (!handled) { event.preventDefault(); handled = true }
          uploadAndInsertImage(file, getEditor(), getEntityId())
        }
      }
      return handled
    },
    handleDrop: (view: any, event: DragEvent) => {
      if (isDisabled()) return false
      const files = event.dataTransfer?.files
      if (!files?.length) return false

      let handled = false
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          if (!handled) { event.preventDefault(); handled = true }
          const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
          uploadAndInsertImage(file, getEditor(), getEntityId(), coords?.pos)
        }
      }
      return handled
    },
  }
}
