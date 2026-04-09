import type { AnyExtension } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { Markdown } from 'tiptap-markdown'
import { common, createLowlight } from 'lowlight'
import { ResizableImage } from './resizable-image'
import { SubDocumentLink } from './sub-document-link'
import { ReferenceNode } from './reference-node'
import { CommandSuggestion } from './command-extension'
import { CommandViewerDecoration } from './command-viewer-decoration'
import { getEditorConfig } from './editor-config'
import { ListShiftEnter } from './extensions/list-shift-enter'
import { MarkdownParseFixes } from './extensions/markdown-parse-fixes'
import { EmptyLinePreserver } from './extensions/empty-line-preserver'
import { BlockquotePipe } from './extensions/blockquote-pipe'
import { DetailsBlock, DetailsBlockSummary, DetailsBlockContent } from './extensions/details-block'

const lowlight = createLowlight(common)

export type TiptapMode = 'editor' | 'input' | 'viewer'
export type TiptapVariant = 'full' | 'chat'

interface CreateExtensionsOptions {
  mode: TiptapMode
  variant?: TiptapVariant
  placeholder?: string
  isCommand?: boolean
}

function createFullExtensions(mode: TiptapMode): AnyExtension[] {
  return [
    BlockquotePipe,
    SubDocumentLink,
    Table.configure({ resizable: mode !== 'viewer' }),
    TableRow,
    TableCell,
    TableHeader,
    TaskList,
    TaskItem.configure({ nested: true }),
    ResizableImage.configure({ inline: false, allowBase64: false }),
    DetailsBlockSummary,
    DetailsBlockContent,
    DetailsBlock,
  ]
}

export function createExtensions({ mode, variant = 'full', placeholder, isCommand }: CreateExtensionsOptions) {
  const cfg = getEditorConfig(mode, variant)

  const extensions: AnyExtension[] = [
    StarterKit.configure({
      paragraph: false,
      codeBlock: false,
      link: false,
      blockquote: false,
      listKeymap: {
        listTypes: [
          { itemName: 'listItem', wrapperNames: ['bulletList', 'orderedList'] },
          { itemName: 'taskItem', wrapperNames: ['taskList'] },
        ],
      },
      ...(!cfg.richFormatting && { heading: false, strike: false, horizontalRule: false, trailingNode: false }),
    }),
    Markdown.configure({
      html: cfg.markdownHtml,
      transformCopiedText: true,
      transformPastedText: true,
    }),
    MarkdownParseFixes,
    CodeBlockLowlight.configure({ lowlight }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      protocols: ['note', 'thread', 'doc'],
    }),
    ReferenceNode,
    EmptyLinePreserver,
  ]

  if (cfg.fullExtensions) extensions.push(...createFullExtensions(mode))
  if (cfg.commandSuggestion) extensions.push(CommandSuggestion)
  if (cfg.commandViewerDeco && isCommand) extensions.push(CommandViewerDecoration)
  if (cfg.listShiftEnter) extensions.push(ListShiftEnter)
  if (placeholder) extensions.push(Placeholder.configure({ placeholder }))

  return extensions
}
