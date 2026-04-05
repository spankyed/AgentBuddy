import type { editor, languages, IDisposable, Uri } from 'monaco-editor'
import type { LspClient } from './lsp-client'
import {
  CompletionItemKind,
  DiagnosticSeverity,
  DiagnosticTag,
  type CompletionItem,
  type CompletionList,
  type Hover,
  type Location,
  type Range as LspRange,
  type Diagnostic,
  type MarkupContent,
  type SignatureHelp,
  type TextEdit,
  type InsertReplaceEdit,
} from 'vscode-languageserver-types'

type Monaco = typeof import('monaco-editor')

const DIDCHANGE_DEBOUNCE_MS = 100

/**
 * Bridges the LspClient to Monaco editor APIs.
 * Registers language providers, tracks document models, and applies diagnostics.
 * Only tracks models with file:// URI scheme — DSL/inmemory models are skipped.
 */
export class MonacoLspBridge {
  private disposables: IDisposable[] = []
  private trackedModels = new Map<string, { contentDisposable: IDisposable; debounceTimer: ReturnType<typeof setTimeout> | null }>()
  private lspItemMap = new WeakMap<languages.CompletionItem, CompletionItem>()
  private supportedLanguages: string[]

  constructor(
    private monaco: Monaco,
    private client: LspClient,
    supportedLanguages: string[],
    private onOpenFile?: (filePath: string, line?: number, column?: number) => void
  ) {
    this.supportedLanguages = supportedLanguages
    this.registerProviders()
    this.registerEditorOpener()
    this.client.onDiagnostics((uri, diagnostics) => this.applyDiagnostics(uri, diagnostics))
  }

  /**
   * Start tracking Monaco models and sending didOpen/didChange/didClose.
   * Must be called after the LSP server has completed the initialize handshake.
   */
  start(): void {
    this.trackModels()
  }

  private registerEditorOpener(): void {
    if (!this.onOpenFile) return

    this.disposables.push(
      this.monaco.editor.registerEditorOpener({
        openCodeEditor: (_source, resource, selectionOrPosition) => {
          if (resource.scheme !== 'file' || !this.onOpenFile) return false

          let line: number | undefined
          let column: number | undefined
          if (selectionOrPosition) {
            if ('startLineNumber' in selectionOrPosition) {
              line = selectionOrPosition.startLineNumber
              column = selectionOrPosition.startColumn
            } else {
              line = selectionOrPosition.lineNumber
              column = selectionOrPosition.column
            }
          }

          this.onOpenFile(resource.path, line, column)
          return true
        }
      })
    )
  }

  private isFileUri(uri: Uri): boolean {
    return uri.scheme === 'file'
  }

  private isSupportedModel(model: editor.ITextModel): boolean {
    return this.isFileUri(model.uri) && this.supportedLanguages.includes(model.getLanguageId())
  }

  // --- Provider Registration ---

  private registerProviders(): void {
    for (const lang of this.supportedLanguages) {
      // Completion — exclusive for file:// URIs so built-in TS completions are suppressed
      this.disposables.push(
        this.monaco.languages.registerCompletionItemProvider(
          { language: lang, scheme: 'file', exclusive: true },
          {
            triggerCharacters: ['.', '"', "'", '/', '<', '@'],
            provideCompletionItems: async (model, position) => {
              const result = await this.client.completion(
                model.uri.toString(),
                toLspPosition(position)
              )
              if (!result) return { suggestions: [] }
              return this.convertCompletionResult(result, model)
            },
            resolveCompletionItem: async (item: any) => {
              const lspItem = this.lspItemMap.get(item)
              if (!lspItem) return item
              const resolved = await this.client.resolveCompletionItem(lspItem)
              if (resolved.documentation) {
                item.documentation = this.convertDocumentation(resolved.documentation)
              }
              if (resolved.detail) {
                item.detail = resolved.detail
              }
              return item
            }
          }
        )
      )

      // Hover
      this.disposables.push(
        this.monaco.languages.registerHoverProvider(lang, {
          provideHover: async (model, position) => {
            if (!this.isFileUri(model.uri)) return undefined
            const result = await this.client.hover(
              model.uri.toString(),
              toLspPosition(position)
            )
            if (!result) return undefined
            return this.convertHoverResult(result)
          }
        })
      )

      // Definition
      this.disposables.push(
        this.monaco.languages.registerDefinitionProvider(lang, {
          provideDefinition: async (model, position) => {
            if (!this.isFileUri(model.uri)) return undefined
            const result = await this.client.definition(
              model.uri.toString(),
              toLspPosition(position)
            )
            if (!result) return undefined
            return this.convertLocationResult(result)
          }
        })
      )

      // Signature Help
      this.disposables.push(
        this.monaco.languages.registerSignatureHelpProvider(lang, {
          signatureHelpTriggerCharacters: ['(', ','],
          provideSignatureHelp: async (model, position) => {
            if (!this.isFileUri(model.uri)) return undefined
            const result = await this.client.signatureHelp(
              model.uri.toString(),
              toLspPosition(position)
            )
            if (!result) return undefined
            return {
              value: this.convertSignatureResult(result),
              dispose: () => {}
            }
          }
        })
      )
    }
  }

  // --- Model Tracking ---

  private trackModels(): void {
    // Track existing models
    for (const model of this.monaco.editor.getModels()) {
      this.onModelAdded(model)
    }

    // Track future models
    this.disposables.push(
      this.monaco.editor.onDidCreateModel((model) => this.onModelAdded(model))
    )
  }

  private onModelAdded(model: editor.ITextModel): void {
    if (!this.isSupportedModel(model)) return

    const uri = model.uri.toString()
    if (this.trackedModels.has(uri)) return

    // Send didOpen
    this.client.didOpen(uri, model.getLanguageId(), model.getValue())

    // Track content changes with debouncing
    const contentDisposable = model.onDidChangeContent(() => {
      const tracked = this.trackedModels.get(uri)
      if (!tracked) return

      if (tracked.debounceTimer) {
        clearTimeout(tracked.debounceTimer)
      }
      tracked.debounceTimer = setTimeout(() => {
        this.client.didChange(uri, model.getValue())
        tracked.debounceTimer = null
      }, DIDCHANGE_DEBOUNCE_MS)
    })

    // Track disposal
    model.onWillDispose(() => {
      const tracked = this.trackedModels.get(uri)
      if (tracked) {
        if (tracked.debounceTimer) clearTimeout(tracked.debounceTimer)
        tracked.contentDisposable.dispose()
      }
      this.trackedModels.delete(uri)
      this.client.didClose(uri)
      // Clear diagnostics for this model
      this.monaco.editor.setModelMarkers(model, 'lsp', [])
    })

    this.trackedModels.set(uri, { contentDisposable, debounceTimer: null })
  }

  // --- Diagnostics ---

  private applyDiagnostics(uri: string, diagnostics: Diagnostic[]): void {
    const monacoUri = this.monaco.Uri.parse(uri)
    const model = this.monaco.editor.getModel(monacoUri)
    if (!model) return

    const markers: editor.IMarkerData[] = diagnostics.map(d => ({
      severity: this.convertSeverity(d.severity),
      message: d.message,
      source: d.source || 'lsp',
      startLineNumber: d.range.start.line + 1,
      startColumn: d.range.start.character + 1,
      endLineNumber: d.range.end.line + 1,
      endColumn: d.range.end.character + 1,
      code: d.code != null ? String(d.code) : undefined,
      tags: d.tags?.map(t => {
        if (t === DiagnosticTag.Unnecessary) return this.monaco.MarkerTag.Unnecessary
        if (t === DiagnosticTag.Deprecated) return this.monaco.MarkerTag.Deprecated
        return undefined
      }).filter((t): t is number => t != null),
      relatedInformation: d.relatedInformation?.map(ri => ({
        resource: this.monaco.Uri.parse(ri.location.uri),
        message: ri.message,
        startLineNumber: ri.location.range.start.line + 1,
        startColumn: ri.location.range.start.character + 1,
        endLineNumber: ri.location.range.end.line + 1,
        endColumn: ri.location.range.end.character + 1,
      })),
    }))

    this.monaco.editor.setModelMarkers(model, 'lsp', markers)
  }

  private convertSeverity(severity?: number): import('monaco-editor').MarkerSeverity {
    const MarkerSeverity = this.monaco.MarkerSeverity
    switch (severity) {
      case DiagnosticSeverity.Error: return MarkerSeverity.Error
      case DiagnosticSeverity.Warning: return MarkerSeverity.Warning
      case DiagnosticSeverity.Information: return MarkerSeverity.Info
      case DiagnosticSeverity.Hint: return MarkerSeverity.Hint
      default: return MarkerSeverity.Info
    }
  }

  // --- Type Conversions ---

  private convertCompletionResult(result: CompletionList, model: editor.ITextModel): languages.CompletionList {
    return {
      incomplete: result.isIncomplete,
      suggestions: result.items.map(item => this.convertCompletionItem(item, model))
    }
  }

  private convertCompletionItem(item: CompletionItem, model: editor.ITextModel): languages.CompletionItem {
    const label = typeof item.label === 'string' ? item.label : item.label.label
    const labelDetail = typeof item.label === 'object' ? item.label : undefined

    const monacoItem: languages.CompletionItem = {
      label: labelDetail ? {
        label: labelDetail.label,
        detail: labelDetail.detail,
        description: labelDetail.description,
      } : label,
      kind: this.convertCompletionKind(item.kind),
      detail: item.detail,
      documentation: item.documentation ? this.convertDocumentation(item.documentation) : undefined,
      sortText: item.sortText,
      filterText: item.filterText,
      insertText: item.insertText || label,
      insertTextRules: item.insertTextFormat === 2
        ? this.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
        : undefined,
      range: this.getCompletionRange(item, model),
      additionalTextEdits: item.additionalTextEdits?.map(edit => this.convertTextEdit(edit)),
    }

    // Store original LSP item for resolve
    this.lspItemMap.set(monacoItem, item)

    return monacoItem
  }

  private getCompletionRange(item: CompletionItem, model: editor.ITextModel): languages.CompletionItem['range'] | undefined {
    if (item.textEdit) {
      if ('range' in item.textEdit) {
        return toMonacoRange(item.textEdit.range)
      }
      // InsertReplaceEdit
      const edit = item.textEdit as InsertReplaceEdit
      return {
        insert: toMonacoRange(edit.insert),
        replace: toMonacoRange(edit.replace),
      }
    }
    // No explicit range — Monaco will compute word range
    return undefined
  }

  private convertCompletionKind(kind?: CompletionItemKind): languages.CompletionItemKind {
    const k = this.monaco.languages.CompletionItemKind
    const map: Record<number, languages.CompletionItemKind> = {
      [CompletionItemKind.Text]: k.Text,
      [CompletionItemKind.Method]: k.Method,
      [CompletionItemKind.Function]: k.Function,
      [CompletionItemKind.Constructor]: k.Constructor,
      [CompletionItemKind.Field]: k.Field,
      [CompletionItemKind.Variable]: k.Variable,
      [CompletionItemKind.Class]: k.Class,
      [CompletionItemKind.Interface]: k.Interface,
      [CompletionItemKind.Module]: k.Module,
      [CompletionItemKind.Property]: k.Property,
      [CompletionItemKind.Unit]: k.Unit,
      [CompletionItemKind.Value]: k.Value,
      [CompletionItemKind.Enum]: k.Enum,
      [CompletionItemKind.Keyword]: k.Keyword,
      [CompletionItemKind.Snippet]: k.Snippet,
      [CompletionItemKind.Color]: k.Color,
      [CompletionItemKind.File]: k.File,
      [CompletionItemKind.Reference]: k.Reference,
      [CompletionItemKind.Folder]: k.Folder,
      [CompletionItemKind.EnumMember]: k.EnumMember,
      [CompletionItemKind.Constant]: k.Constant,
      [CompletionItemKind.Struct]: k.Struct,
      [CompletionItemKind.Event]: k.Event,
      [CompletionItemKind.Operator]: k.Operator,
      [CompletionItemKind.TypeParameter]: k.TypeParameter,
    }
    return kind != null ? (map[kind] ?? k.Text) : k.Text
  }

  private convertHoverResult(hover: Hover): languages.Hover {
    const contents = Array.isArray(hover.contents) ? hover.contents : [hover.contents]
    return {
      contents: contents.map(c => {
        if (typeof c === 'string') {
          return { value: c }
        }
        return {
          value: (c as MarkupContent).kind === 'markdown' ? (c as MarkupContent).value : `\`\`\`\n${(c as MarkupContent).value}\n\`\`\``,
        }
      }),
      range: hover.range ? toMonacoRange(hover.range) : undefined,
    }
  }

  private convertLocationResult(result: Location | Location[]): languages.Location | languages.Location[] {
    if (Array.isArray(result)) {
      return result.map(loc => ({
        uri: this.monaco.Uri.parse(loc.uri),
        range: toMonacoRange(loc.range),
      }))
    }
    return {
      uri: this.monaco.Uri.parse(result.uri),
      range: toMonacoRange(result.range),
    }
  }

  private convertSignatureResult(help: SignatureHelp): languages.SignatureHelp {
    return {
      signatures: help.signatures.map(sig => ({
        label: sig.label,
        documentation: sig.documentation ? this.convertDocumentation(sig.documentation) : undefined,
        parameters: (sig.parameters || []).map(p => ({
          label: p.label,
          documentation: p.documentation ? this.convertDocumentation(p.documentation) : undefined,
        })),
      })),
      activeSignature: help.activeSignature ?? 0,
      activeParameter: help.activeParameter ?? 0,
    }
  }

  private convertDocumentation(doc: string | MarkupContent): string | languages.IMarkdownString {
    if (typeof doc === 'string') return doc
    return { value: doc.value, isTrusted: true }
  }

  private convertTextEdit(edit: TextEdit): languages.TextEdit {
    return {
      range: toMonacoRange(edit.range),
      text: edit.newText,
    }
  }

  // --- Save Notification ---

  notifySave(uri: string, text: string): void {
    if (this.trackedModels.has(uri)) {
      this.client.didSave(uri, text)
    }
  }

  // --- Cleanup ---

  dispose(): void {
    // Dispose all provider registrations
    this.disposables.forEach(d => d.dispose())
    this.disposables = []

    // Clean up tracked models
    for (const [uri, tracked] of this.trackedModels) {
      if (tracked.debounceTimer) clearTimeout(tracked.debounceTimer)
      tracked.contentDisposable.dispose()
    }
    this.trackedModels.clear()

    // Clear all LSP markers
    for (const model of this.monaco.editor.getModels()) {
      this.monaco.editor.setModelMarkers(model, 'lsp', [])
    }
  }
}

// --- Helpers ---

/** Convert Monaco 1-based position to LSP 0-based position */
function toLspPosition(position: { lineNumber: number; column: number }) {
  return {
    line: position.lineNumber - 1,
    character: position.column - 1,
  }
}

/** Convert LSP 0-based range to Monaco 1-based range */
function toMonacoRange(range: LspRange) {
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1,
  }
}
