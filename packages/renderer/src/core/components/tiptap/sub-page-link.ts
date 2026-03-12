import { Node, mergeAttributes } from '@tiptap/core'

const FILE_TEXT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`

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
          const href = el.getAttribute('href') || ''
          return {
            noteId: href.slice('page://'.length),
            title: el.textContent || '',
          }
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
      if (node.attrs.icon) {
        iconSpan.textContent = node.attrs.icon
      } else {
        iconSpan.innerHTML = FILE_TEXT_SVG
      }

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
          if (updatedNode.attrs.icon) {
            iconSpan.textContent = updatedNode.attrs.icon
          } else {
            iconSpan.innerHTML = FILE_TEXT_SVG
          }
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
          state.write(`[${node.attrs.title}](page://${node.attrs.noteId})`)
          state.ensureNewLine()
        },
        parse: {},
      },
    }
  },
})
