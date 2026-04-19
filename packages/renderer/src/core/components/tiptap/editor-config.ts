import type { TiptapMode, TiptapVariant } from './extensions'

export interface EditorConfig {
  editable: boolean
  fullExtensions: boolean       // Tables, TaskList, Details, SubDocLinks, Blockquote, ResizableImage
  richFormatting: boolean       // Headings, strike, horizontalRule, trailingNode (false = disabled)
  markdownHtml: boolean         // Markdown HTML support
  markdownBreaks: boolean       // Single \n → <br> (for chat viewer where Claude uses single newlines)
  commandSuggestion: boolean    // /command input rule
  commandViewerDeco: boolean    // command decoration in viewer (runtime-gated by isCommand prop)
  listShiftEnter: boolean       // Shift+Enter → new bullet
  editorInteractions: boolean   // click/paste/drop handlers for sub-doc links, images
  viewerImageClick: boolean     // image lightbox click in viewer
  subDocumentTracking: boolean  // onTransaction for sub-doc link add/remove
  historyNavigation: boolean    // arrow key message history
  enterSubmit: boolean          // Enter submits, Shift+Enter splits
  blockMenu: boolean            // block menu + image bubble (also gated by showGutter prop)
  textBubbleMenu: boolean
  referencePopup: boolean
  commandPopup: boolean
  searchBar: boolean
}

type ConfigKey = `${TiptapMode}:${TiptapVariant}`

const CONFIGS: Partial<Record<ConfigKey, EditorConfig>> = {
  'editor:full': {
    editable: true,
    fullExtensions: true,
    richFormatting: true,
    markdownHtml: true,
    markdownBreaks: false,
    commandSuggestion: false,
    commandViewerDeco: false,
    listShiftEnter: false,
    editorInteractions: true,
    viewerImageClick: false,
    subDocumentTracking: true,
    historyNavigation: false,
    enterSubmit: false,
    blockMenu: true,
    textBubbleMenu: true,
    referencePopup: true,
    commandPopup: false,
    searchBar: true,
  },
  'input:chat': {
    editable: true,
    fullExtensions: false,
    richFormatting: false,
    markdownHtml: false,
    markdownBreaks: false,
    commandSuggestion: true,
    commandViewerDeco: false,
    listShiftEnter: true,
    editorInteractions: false,
    viewerImageClick: false,
    subDocumentTracking: false,
    historyNavigation: true,
    enterSubmit: true,
    blockMenu: false,
    textBubbleMenu: true,
    referencePopup: true,
    commandPopup: true,
    searchBar: false,
  },
  'viewer:full': {
    editable: false,
    fullExtensions: true,
    richFormatting: true,
    markdownHtml: true,
    markdownBreaks: false,
    commandSuggestion: false,
    commandViewerDeco: false,
    listShiftEnter: false,
    editorInteractions: false,
    viewerImageClick: true,
    subDocumentTracking: false,
    historyNavigation: false,
    enterSubmit: false,
    blockMenu: false,
    textBubbleMenu: false,
    referencePopup: false,
    commandPopup: false,
    searchBar: false,
  },
  'viewer:chat': {
    editable: false,
    fullExtensions: false,
    richFormatting: true, // headings / strike / hr — Claude responses use them
    markdownHtml: false,
    markdownBreaks: true, // Claude Code text uses single \n for paragraph breaks
    commandSuggestion: false,
    commandViewerDeco: true,
    listShiftEnter: false,
    editorInteractions: false,
    viewerImageClick: false,
    subDocumentTracking: false,
    historyNavigation: false,
    enterSubmit: false,
    blockMenu: false,
    textBubbleMenu: false,
    referencePopup: false,
    commandPopup: false,
    searchBar: false,
  },
}

export function getEditorConfig(mode: TiptapMode, variant: TiptapVariant = 'full'): EditorConfig {
  const cfg = CONFIGS[`${mode}:${variant}`]
  if (!cfg) throw new Error(`Unsupported editor config: ${mode}:${variant}`)
  return cfg
}
