import { Node, mergeAttributes } from '@tiptap/core'
import { referenceSuggestionPlugin } from './reference-suggestion-plugin'
import { applicationState } from '@/main'
import { REF_TYPES, ALL_PROTOCOLS, type ReferenceRefType } from './reference-config'

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

  for (const [tag, attrs] of REF_TYPES[type]?.svgElements || REF_TYPES.thread.svgElements) {
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
    return Object.entries(REF_TYPES).map(([refType, cfg]) => ({
      tag: `a[href^="${cfg.protocol}://"]`,
      priority: 60,
      getAttrs(node: HTMLElement) {
        const href = (node as HTMLAnchorElement).getAttribute('href') || ''
        const id = href.slice(cfg.protocol.length + 3)
        return { refType, refId: id, shortCode: id, label: node.textContent || '' }
      },
    }))
  },

  renderHTML({ node }) {
    const cfg = REF_TYPES[node.attrs.refType as ReferenceRefType]
    const protocol = cfg?.protocol || 'thread'
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
    return ({ node, editor }) => {
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

      dom.addEventListener('click', (event) => {
        if (editor.isEditable && !event.metaKey && !event.ctrlKey) return

        const refType = node.attrs.refType as ReferenceRefType
        const refId = node.attrs.refId as string
        const cfg = REF_TYPES[refType]

        cfg.navigate(applicationState.system, refId)
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
          const cfg = REF_TYPES[node.attrs.refType as ReferenceRefType]
          const protocol = cfg?.protocol || 'thread'
          state.write(`[${node.attrs.label}](${protocol}://${node.attrs.shortCode})`)
        },
        parse: {
          updateDOM(element: HTMLElement) {
            for (const protocol of ALL_PROTOCOLS) {
              element.querySelectorAll(`a[href^="${protocol}://"]`).forEach(() => {
                // The default markdown parse already creates <a> elements, which parseHTML handles
              })
            }
          },
        },
      },
    }
  },
})
