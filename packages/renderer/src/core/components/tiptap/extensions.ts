import type { AnyExtension } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { ResizableImage } from './resizable-image'
import { SubPageLink } from './sub-page-link'
import Placeholder from '@tiptap/extension-placeholder'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Details, { DetailsSummary, DetailsContent } from '@tiptap/extension-details'
import { mergeAttributes } from '@tiptap/core'
import { Markdown } from 'tiptap-markdown'
import { common, createLowlight } from 'lowlight'

const lowlight = createLowlight(common)

export type TiptapMode = 'editor' | 'input' | 'viewer'

interface CreateExtensionsOptions {
  mode: TiptapMode
  placeholder?: string
}

export function createExtensions({ mode, placeholder }: CreateExtensionsOptions) {
  const extensions: AnyExtension[] = [
    StarterKit.configure({
      codeBlock: false,
      link: false,
    }),
    Markdown.configure({
      html: true,
      transformCopiedText: true,
      transformPastedText: true,
    }),
    CodeBlockLowlight.configure({
      lowlight,
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      protocols: ['note'],
    }),
    SubPageLink,
    Table.configure({
      resizable: mode !== 'viewer',
    }),
    TableRow,
    TableCell,
    TableHeader,
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    ResizableImage.configure({
      inline: false,
      allowBase64: false,
    }),
    DetailsSummary,
    DetailsContent.extend({
      addNodeView() {
        return ({ HTMLAttributes }) => {
          const dom = document.createElement('div')
          const attributes = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
            'data-type': this.name,
          })
          Object.entries(attributes).forEach(([key, value]) => dom.setAttribute(key, value))

          dom.addEventListener('toggleDetailsContent', () => {
            dom.toggleAttribute('hidden')
          })

          return {
            dom,
            contentDOM: dom,
            ignoreMutation(mutation: Record<string, any>) {
              if (mutation.type === 'selection') {
                return false
              }
              return !dom.contains(mutation.target) || dom === mutation.target
            },
            update: (updatedNode: any) => {
              if (updatedNode.type !== this.type) {
                return false
              }
              return true
            },
          }
        }
      },
    }),
    Details.extend({
      addAttributes() {
        return {
          open: {
            default: true,
            parseHTML: element => element.hasAttribute('open'),
            renderHTML: ({ open }) => {
              if (!open) {
                return {}
              }
              return { open: '' }
            },
          },
        }
      },
      addNodeView() {
        return ({ editor, getPos, node, HTMLAttributes }) => {
          const dom = document.createElement('div')
          const attributes = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
            'data-type': this.name,
          })
          Object.entries(attributes).forEach(([key, value]) => dom.setAttribute(key, value))

          const toggle = document.createElement('button')
          toggle.type = 'button'
          dom.append(toggle)

          const content = document.createElement('div')
          dom.append(content)

          const toggleDetailsContent = (setToValue?: boolean) => {
            if (setToValue !== undefined) {
              if (setToValue) {
                if (dom.classList.contains(this.options.openClassName)) return
                dom.classList.add(this.options.openClassName)
              } else {
                if (!dom.classList.contains(this.options.openClassName)) return
                dom.classList.remove(this.options.openClassName)
              }
            } else {
              dom.classList.toggle(this.options.openClassName)
            }

            const event = new Event('toggleDetailsContent')
            const detailsContent = content.querySelector(':scope > div[data-type="detailsContent"]')
            detailsContent?.dispatchEvent(event)
          }

          // Apply open class immediately — CSS handles visibility, no setTimeout needed
          if (node.attrs.open) {
            dom.classList.add(this.options.openClassName)
          }

          toggle.addEventListener('click', () => {
            toggleDetailsContent()

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
                  if (!pos) return false
                  const currentNode = tr.doc.nodeAt(pos)
                  if (currentNode?.type !== this.type) return false
                  tr.setNodeMarkup(pos, undefined, {
                    open: !currentNode.attrs.open,
                  })
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
            ignoreMutation(mutation: Record<string, any>) {
              if (mutation.type === 'selection') return false
              return !dom.contains(mutation.target) || dom === mutation.target
            },
            update: (updatedNode: any) => {
              if (updatedNode.type !== this.type) return false
              if (updatedNode.attrs.open !== undefined) {
                toggleDetailsContent(updatedNode.attrs.open)
              }
              return true
            },
          }
        }
      },
    }).configure({
      persist: true,
      HTMLAttributes: { class: 'details-block' },
    }),
  ]

  if (mode !== 'viewer' && placeholder) {
    extensions.push(
      Placeholder.configure({
        placeholder,
      }),
    )
  }

  return extensions
}
