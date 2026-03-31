import { ref, computed } from 'vue'
import type { FileReference, ImageReference, MessageReferences } from '@app/api'

export interface PendingImage {
  dataUrl: string
  name: string
}

export interface PendingFile {
  name: string
  path: string
  typeLabel: string
  isImage: boolean
  previewUrl?: string
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
const MAX_IMAGE_SIZE = 10 * 1024 * 1024

function getFileTypeLabel(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    png: 'PNG', jpg: 'JPEG', jpeg: 'JPEG', gif: 'GIF', webp: 'WebP',
    pdf: 'PDF', md: 'Markdown file', txt: 'Text file', json: 'JSON file',
  }
  return map[ext || ''] || (ext ? `${ext.toUpperCase()} file` : 'File')
}

function isImageFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  return IMAGE_EXTENSIONS.has(ext)
}

export function useAttachments() {
  const pendingImages = ref<PendingImage[]>([])
  const pendingFiles = ref<PendingFile[]>([])

  const hasAttachments = computed(() => pendingImages.value.length > 0 || pendingFiles.value.length > 0)

  const getUniqueName = (proposed: string, existing: Set<string>): string => {
    if (!existing.has(proposed)) return proposed
    const dotIdx = proposed.lastIndexOf('.')
    const base = dotIdx > 0 ? proposed.slice(0, dotIdx) : proposed
    const ext = dotIdx > 0 ? proposed.slice(dotIdx) : ''
    let counter = 2
    while (existing.has(`${base} (${counter})${ext}`)) counter++
    return `${base} (${counter})${ext}`
  }

  const handlePaste = (event: ClipboardEvent) => {
    const items = event.clipboardData?.items
    if (!items) return

    const batchNames = new Set(pendingImages.value.map(img => img.name))

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        event.preventDefault()
        const file = item.getAsFile()
        if (!file || !ALLOWED_IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_SIZE) continue

        const name = getUniqueName(file.name || 'image.png', batchNames)
        batchNames.add(name)

        const reader = new FileReader()
        reader.onload = () => {
          pendingImages.value = [...pendingImages.value, {
            dataUrl: reader.result as string,
            name,
          }]
        }
        reader.readAsDataURL(file)
      }
    }
  }

  const removeImage = (i: number) => {
    pendingImages.value = pendingImages.value.filter((_, idx) => idx !== i)
  }

  const openFilePicker = async () => {
    const result = await window.electronAPI?.fileUtils.selectPath({
      type: 'file',
      allowMultiple: true,
    })
    if (!result) return
    const paths = Array.isArray(result) ? result : [result]
    const newFiles = await Promise.all(paths.map(async p => {
      const name = p.split('/').pop() || p
      const isImg = isImageFile(name)
      let previewUrl: string | undefined
      if (isImg) {
        try {
          const ext = name.split('.').pop()?.toLowerCase() || 'png'
          const mimeMap: Record<string, string> = {
            png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
            gif: 'image/gif', webp: 'image/webp',
          }
          const mime = mimeMap[ext] || 'image/png'
          const base64 = await window.electronAPI?.fileUtils.readFileBase64(p)
          if (base64) previewUrl = `data:${mime};base64,${base64}`
        } catch { /* preview unavailable */ }
      }
      return { name, path: p, typeLabel: getFileTypeLabel(name), isImage: isImg, previewUrl }
    }))
    pendingFiles.value = [...pendingFiles.value, ...newFiles]
  }

  const removeFile = (i: number) => {
    pendingFiles.value = pendingFiles.value.filter((_, idx) => idx !== i)
  }

  const collectAttachments = async (entityId: string): Promise<MessageReferences | undefined> => {
    const imageRefs: ImageReference[] = []
    for (const img of pendingImages.value) {
      const match = img.dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/)
      if (match) {
        const url = await window.electronAPI?.media.upload(entityId, match[2], match[1])
        if (url) imageRefs.push({ url, name: img.name })
      }
    }
    const files: FileReference[] = pendingFiles.value.map(f => ({
      name: f.name, path: f.path, typeLabel: f.typeLabel,
      isImage: f.isImage,
      // previewUrl deliberately omitted — base64 not stored
    }))
    if (!imageRefs.length && !files.length) return undefined
    return {
      ...(imageRefs.length && { images: imageRefs }),
      ...(files.length && { files }),
    }
  }

  const clearAll = () => {
    pendingImages.value = []
    pendingFiles.value = []
  }

  return {
    pendingImages,
    pendingFiles,
    hasAttachments,
    handlePaste,
    removeImage,
    openFilePicker,
    removeFile,
    collectAttachments,
    clearAll,
  }
}
