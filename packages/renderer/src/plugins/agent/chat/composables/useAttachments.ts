import { ref, computed } from 'vue'

export interface PendingFile {
  name: string
  path: string
  typeLabel: string
  isImage: boolean
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
  const pendingImages = ref<string[]>([])
  const pendingFiles = ref<PendingFile[]>([])

  const hasAttachments = computed(() => pendingImages.value.length > 0 || pendingFiles.value.length > 0)

  const handlePaste = (event: ClipboardEvent) => {
    const items = event.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        event.preventDefault()
        const file = item.getAsFile()
        if (!file || !ALLOWED_IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_SIZE) continue
        const reader = new FileReader()
        reader.onload = () => {
          pendingImages.value = [...pendingImages.value, reader.result as string]
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
    const newFiles = paths.map(p => {
      const name = p.split('/').pop() || p
      return {
        name,
        path: p,
        typeLabel: getFileTypeLabel(name),
        isImage: isImageFile(name),
      }
    })
    pendingFiles.value = [...pendingFiles.value, ...newFiles]
  }

  const removeFile = (i: number) => {
    pendingFiles.value = pendingFiles.value.filter((_, idx) => idx !== i)
  }

  const collectAttachments = (): string[] | undefined => {
    const all = [...pendingImages.value, ...pendingFiles.value.map(f => f.path)]
    return all.length ? all : undefined
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
