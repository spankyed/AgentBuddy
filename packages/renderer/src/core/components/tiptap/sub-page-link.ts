import { Node, mergeAttributes } from '@tiptap/core'

const FILE_TEXT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`

function parsePageHref(href: string) {
  const url = href.slice('page://'.length)
  const qIndex = url.indexOf('?icon=')
  const noteId = qIndex >= 0 ? url.slice(0, qIndex) : url
  const icon = qIndex >= 0 ? decodeURIComponent(url.slice(qIndex + 6)) : null
  return { noteId, icon }
}

function setIcon(el: HTMLSpanElement, icon: string | null) {
  if (icon) {
    el.textContent = icon
  } else {
    el.innerHTML = FILE_TEXT_SVG
  }
}

export const SubPageLink = Node.create({
  name: 'subPageLink',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      noteId: { default: null },
      title: { default: '' },
      icon: { default: null },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'a[href^="page://"]',
        priority: 60,
        getAttrs(node) {
          const el = node as HTMLAnchorElement
          const { noteId, icon } = parsePageHref(el.getAttribute('href') || '')
          return { noteId, title: el.textContent || '', icon }
        },
      },
    ]
  },

  renderHTML({ node }) {
    return [
      'div',
      mergeAttributes({
        class: 'sub-page-link',
        'data-note-id': node.attrs.noteId,
      }),
      ['span', { class: 'sub-page-link-icon' }, node.attrs.icon || ''],
      ['span', { class: 'sub-page-link-title' }, node.attrs.title],
    ]
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div')
      dom.classList.add('sub-page-link')
      dom.dataset.noteId = node.attrs.noteId

      const iconSpan = document.createElement('span')
      iconSpan.classList.add('sub-page-link-icon')
      setIcon(iconSpan, node.attrs.icon)

      const titleSpan = document.createElement('span')
      titleSpan.classList.add('sub-page-link-title')
      titleSpan.textContent = node.attrs.title

      dom.appendChild(iconSpan)
      dom.appendChild(titleSpan)

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type.name !== 'subPageLink') return false
          dom.dataset.noteId = updatedNode.attrs.noteId
          setIcon(iconSpan, updatedNode.attrs.icon)
          titleSpan.textContent = updatedNode.attrs.title
          return true
        },
      }
    }
  },

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { state } = editor
        const { selection } = state
        if (!selection.empty || selection.from !== 1) return false

        const firstNode = state.doc.firstChild
        if (!firstNode || firstNode.type.name !== 'paragraph' || firstNode.content.size !== 0) return false
        if (state.doc.childCount < 2) return false

        editor.commands.deleteRange({ from: 0, to: firstNode.nodeSize })
        return true
      },
    }
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const icon = node.attrs.icon ? `?icon=${encodeURIComponent(node.attrs.icon)}` : ''
          state.write(`[${node.attrs.title}](page://${node.attrs.noteId}${icon})`)
          state.ensureNewLine()
        },
        parse: {
          updateDOM(element: HTMLElement) {
            element.querySelectorAll('a[href^="page://"]').forEach(el => {
              const parent = el.parentElement
              if (!parent || parent.tagName !== 'P') return

              // Clone <p> for content before the link
              const before = parent.cloneNode(false) as HTMLElement
              while (parent.firstChild && parent.firstChild !== el) {
                before.appendChild(parent.firstChild)
              }
              // Only insert if there's meaningful (non-whitespace) content
              if (before.childNodes.length > 0 && before.textContent?.trim()) {
                parent.parentElement!.insertBefore(before, parent)
              }
              // Move <a> to block level
              parent.parentElement!.insertBefore(el, parent)
              // Remove <p> shell if empty or whitespace-only
              if (!parent.textContent?.trim()) {
                parent.remove()
              }
            })
          },
        },
      },
    }
  },
})
