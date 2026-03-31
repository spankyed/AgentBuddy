import { Node, mergeAttributes } from '@tiptap/core'
import { referenceSuggestionPlugin, referenceSuggestionPluginKey } from './reference-suggestion-plugin'
import { applicationState } from '@/main'

export type ReferenceRefType = 'thread' | 'document' | 'folder' | 'note'

const PROTOCOL_MAP: Record<ReferenceRefType, string> = {
  thread: 'thread',
  document: 'doc',
  folder: 'folder',
  note: 'note',
}

const PROTOCOL_TO_TYPE: Record<string, ReferenceRefType> = {
  thread: 'thread',
  doc: 'document',
  folder: 'folder',
  note: 'note',
}

// Lucide icon SVG elements per type (matches plugin sidebar icons)
type SvgElement = ['path', { d: string }] | ['rect', Record<string, string>]

const TYPE_ICON_ELEMENTS: Record<ReferenceRefType, SvgElement[]> = {
  thread: [ // History
    ['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }],
    ['path', { d: 'M3 3v5h5' }],
    ['path', { d: 'M12 7v5l4 2' }],
  ],
  document: [ // Library
    ['path', { d: 'm16 6 4 14' }],
    ['path', { d: 'M12 6v14' }],
    ['path', { d: 'M8 8v12' }],
    ['path', { d: 'M4 4v16' }],
  ],
  folder: [ // Folder
    ['path', { d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z' }],
  ],
  note: [ // NotebookText
    ['path', { d: 'M2 6h4' }],
    ['path', { d: 'M2 10h4' }],
    ['path', { d: 'M2 14h4' }],
    ['path', { d: 'M2 18h4' }],
    ['rect', { width: '16', height: '20', x: '4', y: '2', rx: '2' }],
    ['path', { d: 'M9.5 8h5' }],
    ['path', { d: 'M9.5 12H16' }],
    ['path', { d: 'M9.5 16H14' }],
  ],
}

function createIconSvg(type: ReferenceRefType): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('width', '14')
  svg.setAttribute('height', '14')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')

  for (const [tag, attrs] of TYPE_ICON_ELEMENTS[type] || TYPE_ICON_ELEMENTS.thread) {
    const el = document.createElementNS(ns, tag)
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, v)
    }
    svg.appendChild(el)
  }

  return svg
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
        tag: 'a[href^="folder://"]',
        priority: 60,
        getAttrs(node) {
          const el = node as HTMLAnchorElement
          const href = el.getAttribute('href') || ''
          const id = href.slice('folder://'.length)
          return { refType: 'folder', refId: id, shortCode: id, label: el.textContent || '' }
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
      icon.appendChild(createIconSvg(node.attrs.refType as ReferenceRefType))

      const label = document.createElement('span')
      label.classList.add('reference-pill-label')
      label.textContent = node.attrs.label

      dom.appendChild(icon)
      dom.appendChild(label)

      dom.addEventListener('click', () => {
        const refType = node.attrs.refType as ReferenceRefType
        const refId = node.attrs.refId as string
        const { system } = applicationState

        const pluginMap: Record<ReferenceRefType, string> = {
          thread: 'threads',
          document: 'library',
          folder: 'library',
          note: 'notes',
        }

        system.get('application').send({ type: 'SELECT_PLUGIN', pluginId: pluginMap[refType] })

        if (refType === 'thread') {
          system.get('threads').send({ type: 'SELECT_THREAD', id: refId })
        } else if (refType === 'document') {
          system.get('library').send({ type: 'EDIT_DOCUMENT', documentId: refId })
        } else if (refType === 'folder') {
          system.get('library').send({ type: 'NAVIGATE_TO_FOLDER', folderId: refId })
        } else if (refType === 'note') {
          system.get('notes').send({ type: 'NOTE.OPEN', noteId: refId })
        }
      })

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type.name !== 'reference') return false
          dom.dataset.refType = updatedNode.attrs.refType
          icon.replaceChildren(createIconSvg(updatedNode.attrs.refType as ReferenceRefType))
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
            for (const protocol of ['thread', 'doc', 'folder', 'note']) {
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
