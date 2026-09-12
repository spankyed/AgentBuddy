import Details, { DetailsSummary, DetailsContent } from '@tiptap/extension-details'
import { mergeAttributes, InputRule } from '@tiptap/core'
import { Selection } from '@tiptap/pm/state'

function applyAttributes(dom: HTMLElement, ...sources: Record<string, any>[]) {
  for (const [key, value] of Object.entries(mergeAttributes(...sources))) {
    dom.setAttribute(key, value)
  }
}

export const DetailsBlockSummary = DetailsSummary.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write('<summary>')
          state.renderInline(node)
          state.write('</summary>')
          state.closeBlock(node)
        },
        parse: {},
      },
    }
  },
})

export const DetailsBlockContent = DetailsContent.extend({
  // CSS handles visibility via parent's is-open class, so remove default hidden attribute
  addNodeView() {
    return ({ HTMLAttributes }) => {
      const dom = document.createElement('div')
      applyAttributes(dom, this.options.HTMLAttributes, HTMLAttributes, { 'data-type': this.name })
      return { dom, contentDOM: dom }
    }
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write('\n')
          state.renderContent(node)
        },
        parse: {},
      },
    }
  },
})

export const DetailsBlock = Details.extend({
  addInputRules() {
    return [
      new InputRule({
        find: /^\s*>\s$/,
        handler: ({ range, chain }) => {
          chain().deleteRange(range).setDetails().run()
        },
      }),
    ]
  },
  addKeyboardShortcuts() {
    const parentShortcuts = this.parent?.()
    return {
      ...parentShortcuts,
      Enter: (args) => {
        const { state, view } = args.editor
        const { $head } = state.selection

        // Only intercept: cursor in summary + content visible
        if (
          $head.parent.type === state.schema.nodes.detailsSummary &&
          (view.domAtPos($head.after() + 1).node as HTMLElement).offsetParent !== null
        ) {
          // Move cursor into existing content instead of inserting new paragraph at index 0
          const sel = Selection.near(state.doc.resolve($head.after() + 1), 1)
          view.dispatch(state.tr.setSelection(sel).scrollIntoView())
          return true
        }

        return parentShortcuts?.Enter?.(args) ?? false
      },
    }
  },
  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: element => element.hasAttribute('open'),
        renderHTML: ({ open }) => (open ? { open: '' } : {}),
      },
    }
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(node.attrs.open ? '<details open>\n' : '<details>\n')
          state.renderContent(node)
          state.ensureNewLine()
          state.write('</details>')
          state.closeBlock(node)
        },
        parse: {},
      },
    }
  },
  // Apply is-open class synchronously instead of via setTimeout
  addNodeView() {
    return ({ editor, getPos, node, HTMLAttributes }) => {
      const dom = document.createElement('div')
      applyAttributes(dom, this.options.HTMLAttributes, HTMLAttributes, { 'data-type': this.name })

      const toggle = document.createElement('button')
      toggle.type = 'button'
      dom.append(toggle)

      const content = document.createElement('div')
      dom.append(content)

      if (node.attrs.open) {
        dom.classList.add(this.options.openClassName)
      }

      toggle.addEventListener('click', () => {
        dom.classList.toggle(this.options.openClassName)

        if (!this.options.persist) {
          editor.commands.focus(undefined, { scrollIntoView: false })
          return
        }

        if (editor.isEditable && typeof getPos === 'function') {
          const { from, to } = editor.state.selection
          editor
            .chain()
            .command(({ tr }) => {
              const pos = getPos()
              if (pos == null) return false
              const currentNode = tr.doc.nodeAt(pos)
              if (currentNode?.type !== this.type) return false
              tr.setNodeMarkup(pos, undefined, { open: !currentNode.attrs.open })
              return true
            })
            .setTextSelection({ from, to })
            .focus(undefined, { scrollIntoView: false })
            .run()
        }
      })

      return {
        dom,
        contentDOM: content,
        update: (updatedNode: any) => {
          if (updatedNode.type !== this.type) return false
          dom.classList.toggle(this.options.openClassName, !!updatedNode.attrs.open)
          return true
        },
      }
    }
  },
}).configure({
  persist: true,
  HTMLAttributes: { class: 'details-block' },
})
