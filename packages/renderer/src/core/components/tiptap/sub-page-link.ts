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
      ['span', { class: 'sub-page-link-icon', innerHTML: FILE_TEXT_SVG }],
      ['span', { class: 'sub-page-link-title' }, node.attrs.title],
    ]
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
