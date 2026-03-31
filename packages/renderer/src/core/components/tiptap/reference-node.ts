import { Node, mergeAttributes } from '@tiptap/core'
import { referenceSuggestionPlugin, referenceSuggestionPluginKey } from './reference-suggestion-plugin'

export type ReferenceRefType = 'thread' | 'document' | 'note'

const PROTOCOL_MAP: Record<ReferenceRefType, string> = {
  thread: 'thread',
  document: 'doc',
  note: 'note',
}

const PROTOCOL_TO_TYPE: Record<string, ReferenceRefType> = {
  thread: 'thread',
  doc: 'document',
  note: 'note',
}

const TYPE_ICONS: Record<ReferenceRefType, string> = {
  thread: '#',
  document: '\u{1F4C4}',
  note: '\u{1F4DD}',
}

export const ReferenceNode = Node.create({
  name: 'reference',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      refType: { default: 'thread' },
      refId: { default: null },
      shortCode: { default: '' },
      label: { default: '' },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'a[href^="thread://"]',
        priority: 60,
        getAttrs(node) {
          const el = node as HTMLAnchorElement
          const href = el.getAttribute('href') || ''
          const shortCode = href.slice('thread://'.length)
          return { refType: 'thread', refId: shortCode, shortCode, label: el.textContent || '' }
        },
      },
      {
        tag: 'a[href^="doc://"]',
        priority: 60,
        getAttrs(node) {
          const el = node as HTMLAnchorElement
          const href = el.getAttribute('href') || ''
          const shortCode = href.slice('doc://'.length)
          return { refType: 'document', refId: shortCode, shortCode, label: el.textContent || '' }
        },
      },
      {
        tag: 'a[href^="note://"]',
        priority: 60,
        getAttrs(node) {
          const el = node as HTMLAnchorElement
          const href = el.getAttribute('href') || ''
          const id = href.slice('note://'.length)
          return { refType: 'note', refId: id, shortCode: id, label: el.textContent || '' }
        },
      },
    ]
  },

  renderHTML({ node }) {
    const protocol = PROTOCOL_MAP[node.attrs.refType as ReferenceRefType] || 'thread'
    return [
      'a',
      mergeAttributes({
        href: `${protocol}://${node.attrs.shortCode}`,
        class: 'reference-pill',
        'data-ref-type': node.attrs.refType,
      }),
      node.attrs.label,
    ]
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span')
      dom.classList.add('reference-pill')
      dom.dataset.refType = node.attrs.refType
      dom.contentEditable = 'false'

      const icon = document.createElement('span')
      icon.classList.add('reference-pill-icon')
      icon.textContent = TYPE_ICONS[node.attrs.refType as ReferenceRefType] || '#'

      const label = document.createElement('span')
      label.classList.add('reference-pill-label')
      label.textContent = node.attrs.label

      dom.appendChild(icon)
      dom.appendChild(label)

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type.name !== 'reference') return false
          dom.dataset.refType = updatedNode.attrs.refType
          icon.textContent = TYPE_ICONS[updatedNode.attrs.refType as ReferenceRefType] || '#'
          label.textContent = updatedNode.attrs.label
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
        const { $from } = selection

        // If selection is empty and cursor is right after a reference node, select it for deletion
        if (selection.empty && $from.nodeBefore?.type.name === 'reference') {
          const pos = $from.pos - $from.nodeBefore.nodeSize
          editor.chain().setTextSelection({ from: pos, to: $from.pos }).deleteSelection().run()
          return true
        }

        return false
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      referenceSuggestionPlugin(this.editor),
    ]
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const protocol = PROTOCOL_MAP[node.attrs.refType as ReferenceRefType] || 'thread'
          state.write(`[${node.attrs.label}](${protocol}://${node.attrs.shortCode})`)
        },
        parse: {
          updateDOM(element: HTMLElement) {
            // Convert parsed markdown links with our protocols back into <a> tags
            // The markdown parser will create standard <a> elements from [label](protocol://code)
            // so we just need to ensure they survive for parseHTML to pick them up
            for (const protocol of ['thread', 'doc', 'note']) {
              element.querySelectorAll(`a[href^="${protocol}://"]`).forEach((el) => {
                // Ensure the link is inline (not wrapped in block-only <p> with nothing else)
                // The default markdown parse already creates <a> elements, which parseHTML handles
              })
            }
          },
        },
      },
    }
  },
})
