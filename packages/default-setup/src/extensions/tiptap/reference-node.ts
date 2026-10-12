import { Node, mergeAttributes } from '@tiptap/core'
import { referenceSuggestionPlugin } from './reference-suggestion-plugin.ts'
import { referenceRegistry } from '@apackdev/sdk/fe/references'
import type { ReferenceType } from './reference-config.ts'

/**
 * What a reference whose type no registered pack declares is drawn as: a broken link, rather than whichever
 * type happened to be at hand. One feature's `thread` was the default here, so a reference from another pack
 * — or from a pack that is no longer installed — was drawn as a thread and said nothing.
 */
const UNKNOWN_TYPE_ICON: ReadonlyArray<readonly [string, Record<string, string>]> = [
  ['path', { d: 'M9 17H7A5 5 0 0 1 7 7h2' }],
  ['path', { d: 'M15 7h2a5 5 0 0 1 4 8' }],
  ['line', { x1: '2', y1: '2', x2: '22', y2: '22' }],
]

/**
 * The scheme a reference's link is written with. A type no pack declares has none, so the link names the type
 * instead — which the pack that owns it can still read, where a borrowed `thread://` could not.
 */
function protocolOf(type: ReferenceType): string {
  return referenceRegistry.type(type)?.protocol ?? type
}

function createIconSvg(type: ReferenceType): SVGSVGElement {
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

  for (const [tag, attrs] of referenceRegistry.type(type)?.svgElements ?? UNKNOWN_TYPE_ICON) {
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
    return Object.entries(referenceRegistry.types()).map(([refType, cfg]) => ({
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
    const protocol = protocolOf(node.attrs.refType as ReferenceType)
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
      icon.appendChild(createIconSvg(node.attrs.refType as ReferenceType))

      const label = document.createElement('span')
      label.classList.add('reference-pill-label')
      label.textContent = node.attrs.label

      dom.appendChild(icon)
      dom.appendChild(label)

      dom.addEventListener('click', (event) => {
        if (editor.isEditable && !event.metaKey && !event.ctrlKey) return

        const refType = node.attrs.refType as ReferenceType
        const refId = node.attrs.refId as string

        // A type whose pack isn't installed has nowhere to go, and a click on its pill is not an error
        referenceRegistry.type(refType)?.navigate(refId)
      })

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type.name !== 'reference') return false
          dom.dataset.refType = updatedNode.attrs.refType
          icon.replaceChildren(createIconSvg(updatedNode.attrs.refType as ReferenceType))
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
          const protocol = protocolOf(node.attrs.refType as ReferenceType)
          state.write(`[${node.attrs.label}](${protocol}://${node.attrs.shortCode})`)
        },
        parse: {
          updateDOM(element: HTMLElement) {
            for (const protocol of referenceRegistry.protocols()) {
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
