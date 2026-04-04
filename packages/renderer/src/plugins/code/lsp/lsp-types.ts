// Minimal LSP type subset for the Monaco bridge

export interface Position {
  line: number
  character: number
}

export interface Range {
  start: Position
  end: Position
}

export interface Location {
  uri: string
  range: Range
}

export interface TextDocumentIdentifier {
  uri: string
}

export interface TextDocumentPositionParams {
  textDocument: TextDocumentIdentifier
  position: Position
}

// Completion
export enum CompletionItemKind {
  Text = 1, Method = 2, Function = 3, Constructor = 4, Field = 5,
  Variable = 6, Class = 7, Interface = 8, Module = 9, Property = 10,
  Unit = 11, Value = 12, Enum = 13, Keyword = 14, Snippet = 15,
  Color = 16, File = 17, Reference = 18, Folder = 19, EnumMember = 20,
  Constant = 21, Struct = 22, Event = 23, Operator = 24, TypeParameter = 25,
}

export interface CompletionItem {
  label: string | { label: string; detail?: string; description?: string }
  kind?: CompletionItemKind
  detail?: string
  documentation?: string | MarkupContent
  sortText?: string
  filterText?: string
  insertText?: string
  insertTextFormat?: 1 | 2 // PlainText | Snippet
  textEdit?: TextEdit | InsertReplaceEdit
  additionalTextEdits?: TextEdit[]
}

export interface CompletionList {
  isIncomplete: boolean
  items: CompletionItem[]
}

export interface TextEdit {
  range: Range
  newText: string
}

export interface InsertReplaceEdit {
  newText: string
  insert: Range
  replace: Range
}

// Hover
export interface MarkupContent {
  kind: 'plaintext' | 'markdown'
  value: string
}

export interface Hover {
  contents: MarkupContent | string | Array<string | MarkupContent>
  range?: Range
}

// Diagnostics
export enum DiagnosticSeverity {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4,
}

export interface Diagnostic {
  range: Range
  severity?: DiagnosticSeverity
  code?: number | string
  source?: string
  message: string
  relatedInformation?: DiagnosticRelatedInformation[]
}

export interface DiagnosticRelatedInformation {
  location: Location
  message: string
}

// Signature Help
export interface SignatureHelp {
  signatures: SignatureInformation[]
  activeSignature?: number
  activeParameter?: number
}

export interface SignatureInformation {
  label: string
  documentation?: string | MarkupContent
  parameters?: ParameterInformation[]
}

export interface ParameterInformation {
  label: string | [number, number]
  documentation?: string | MarkupContent
}

// Capabilities
export interface ClientCapabilities {
  textDocument?: {
    completion?: {
      completionItem?: {
        snippetSupport?: boolean
        documentationFormat?: string[]
      }
    }
    hover?: {
      contentFormat?: string[]
    }
    signatureHelp?: {
      signatureInformation?: {
        documentationFormat?: string[]
        parameterInformation?: {
          labelOffsetSupport?: boolean
        }
      }
    }
  }
}

export interface ServerCapabilities {
  completionProvider?: {
    triggerCharacters?: string[]
    resolveProvider?: boolean
  }
  hoverProvider?: boolean
  definitionProvider?: boolean
  signatureHelpProvider?: {
    triggerCharacters?: string[]
  }
  textDocumentSync?: number | {
    openClose?: boolean
    change?: number
    save?: boolean | { includeText?: boolean }
  }
  [key: string]: unknown
}
