import 'highlight.js/styles/github-dark.css'
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
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
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
import { ImageUploadPlaceholder } from './extensions/image-upload-placeholder'
import { CustomHorizontalRule } from './extensions/custom-horizontal-rule'

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
  // Note: BlockquotePipe is NOT in this list anymore — it's pushed
  // unconditionally in createExtensions below so the chat viewer can render
  // `> …` blockquotes (from Claude responses and tool-use annotations).
  return [
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
      gapcursor: false,
      horizontalRule: false,
      dropcursor: { color: 'rgb(96 165 250 / 0.5)', width: 4 },
      code: { HTMLAttributes: { spellcheck: 'false' } },
      listKeymap: {
        listTypes: [
          { itemName: 'listItem', wrapperNames: ['bulletList', 'orderedList'] },
          { itemName: 'taskItem', wrapperNames: ['taskList'] },
        ],
      },
      ...(!cfg.richFormatting && { heading: false, strike: false, trailingNode: false }),
    }),
    // Blockquote is loaded unconditionally (custom input rule is `|<space>`,
    // not `>`, so it doesn't collide with `>`-typed chat input). This ensures
    // the chat viewer has a `blockquote` schema node to parse markdown like
    // `> text` into — without it, tiptap-markdown falls back to inserting the
    // raw `<blockquote><p>…</p></blockquote>` HTML as literal text.
    BlockquotePipe,
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

  if (cfg.richFormatting) extensions.push(Color, Highlight.configure({ multicolor: true }), CustomHorizontalRule)
  if (cfg.fullExtensions) extensions.push(...createFullExtensions(mode))
  if (cfg.commandSuggestion) extensions.push(CommandSuggestion)
  if (cfg.commandViewerDeco && isCommand) extensions.push(CommandViewerDecoration)
  if (cfg.listShiftEnter) extensions.push(ListShiftEnter)
  if (cfg.editorInteractions) extensions.push(ImageUploadPlaceholder)
  if (placeholder) extensions.push(Placeholder.configure({
    placeholder: ({ node }) => {
      if (node.type.name === 'heading') return `Heading ${node.attrs.level}`
      if (node.type.name === 'codeBlock') return 'Write code...'
      if (node.type.name === 'detailsSummary') return 'Toggle summary'
      return placeholder
    },
    includeChildren: true,
  }))

  return extensions
}
