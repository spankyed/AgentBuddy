import type { AnyExtension } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
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
    }),
    Markdown.configure({
      html: false,
      transformCopiedText: true,
      transformPastedText: true,
    }),
    CodeBlockLowlight.configure({
      lowlight,
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
    }),
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
    Image.configure({
      inline: false,
      allowBase64: false,
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
