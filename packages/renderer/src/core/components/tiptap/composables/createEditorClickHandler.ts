import { openInAppBrowser } from '@/core/utils/openInAppBrowser'

type ClickEmit = {
  noteLinkClick: (noteId: string) => void
  imageClick: (src: string) => void
}

export function createEditorClickHandler(emit: ClickEmit) {
  return (_view: any, _pos: any, event: MouseEvent) => {
    // Sub-document links open on regular click (no modifier needed)
    const subDocumentEl = (event.target as HTMLElement).closest('.sub-document-link')
    if (subDocumentEl) {
      const noteId = subDocumentEl.getAttribute('data-note-id')
      if (noteId) {
        emit.noteLinkClick(noteId)
        return true
      }
    }
    // document:// inline links also open on regular click (no modifier needed)
    const anchor = (event.target as HTMLElement).closest('a')
    const href = anchor?.getAttribute('href')
    if (href?.startsWith('document://')) {
      emit.noteLinkClick(href.slice('document://'.length))
      return true
    }
    // Cmd+click on image → open lightbox
    if (event.metaKey || event.ctrlKey) {
      const img = (event.target as HTMLElement).closest('img')
      if (img?.src) {
        emit.imageClick(img.src)
        return true
      }
    }
    // Other links require ctrl/cmd+click in editor mode
    if (!(event.ctrlKey || event.metaKey)) return false
    if (!href) return false
    if (href.startsWith('note://')) {
      emit.noteLinkClick(href.slice('note://'.length))
      return true
    }
    const url = /^https?:\/\//.test(href) ? href : `https://${href}`
    openInAppBrowser(url)
    return true
  }
}

export function createViewerClickHandler(emit: { imageClick: (src: string) => void }) {
  return (_view: any, _pos: any, event: MouseEvent) => {
    // Links open on regular click in viewer mode
    const anchor = (event.target as HTMLElement).closest('a')
    const href = anchor?.getAttribute('href')
    if (href) {
      const url = /^https?:\/\//.test(href) ? href : `https://${href}`
      openInAppBrowser(url)
      return true
    }
    const img = (event.target as HTMLElement).closest('img')
    if (img?.src) {
      emit.imageClick(img.src)
      return true
    }
    return false
  }
}
