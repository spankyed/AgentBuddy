import { trpc } from '@/core/trpc'
import type {
  Position,
  CompletionList,
  Hover,
  Location,
  SignatureHelp,
  ClientCapabilities,
  ServerCapabilities,
  Diagnostic,
} from './lsp-types'

type DiagnosticsCallback = (uri: string, diagnostics: Diagnostic[]) => void
type LogCallback = (message: string) => void

export class LspClient {
  private nextId = 1
  private pendingRequests = new Map<number, { resolve: (value: any) => void; reject: (error: any) => void; method: string; timeout: ReturnType<typeof setTimeout> }>()
  private documentVersions = new Map<string, number>()
  private serverId: string | null = null
  private diagnosticsCallback: DiagnosticsCallback | null = null
  private logCallback: LogCallback | null = null
  private serverCapabilities: ServerCapabilities | null = null

  setServerId(id: string): void {
    this.serverId = id
  }

  getServerId(): string | null {
    return this.serverId
  }

  /**
   * Called by the state machine when lsp.FROM_SERVER arrives.
   * Parses JSON-RPC message and routes to the appropriate handler.
   */
  handleServerMessage(messageStr: string): void {
    let message: any
    try {
      message = JSON.parse(messageStr)
    } catch {
      console.warn('[LSP Client] Failed to parse server message:', messageStr.slice(0, 200))
      return
    }

    // Response to a request we sent
    if ('id' in message && message.id != null && this.pendingRequests.has(message.id)) {
      const { resolve, reject, timeout } = this.pendingRequests.get(message.id)!
      clearTimeout(timeout)
      this.pendingRequests.delete(message.id)
      if (message.error) {
        reject(message.error)
      } else {
        resolve(message.result)
      }
      return
    }

    // Server-initiated notification
    if (message.method) {
      this.handleNotification(message.method, message.params)
    }
  }

  private handleNotification(method: string, params: any): void {
    switch (method) {
      case 'textDocument/publishDiagnostics':
        this.diagnosticsCallback?.(params.uri, params.diagnostics || [])
        break
      case 'window/logMessage':
        this.logCallback?.(params.message)
        break
      case 'window/showMessage':
        // Could surface this to UI in the future
        console.log(`[LSP Server] ${params.message}`)
        break
    }
  }

  // --- Sending ---

  private send(message: string): void {
    if (!this.serverId) return
    trpc.bus.send.mutate({
      systemId: 'code' as any,
      type: 'lsp.TO_SERVER' as any,
      serverId: this.serverId,
      message,
    } as any)
  }

  /**
   * Send a JSON-RPC request and return a Promise of the result.
   */
  async request<T = any>(method: string, params: any): Promise<T> {
    const id = this.nextId++
    const message = JSON.stringify({ jsonrpc: '2.0', id, method, params })
    this.send(message)

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error(`LSP request "${method}" timed out`))
        }
      }, 30000)

      this.pendingRequests.set(id, { resolve, reject, method, timeout })
    })
  }

  /**
   * Send a JSON-RPC notification (no response expected).
   */
  notify(method: string, params: any): void {
    const message = JSON.stringify({ jsonrpc: '2.0', method, params })
    this.send(message)
  }

  // --- LSP Lifecycle ---

  async initialize(rootUri: string, capabilities?: ClientCapabilities): Promise<ServerCapabilities> {
    const defaultCapabilities: ClientCapabilities = {
      textDocument: {
        synchronization: {
          didSave: true,
        },
        completion: {
          completionItem: {
            snippetSupport: true,
            documentationFormat: ['markdown', 'plaintext'],
            resolveSupport: {
              properties: ['documentation', 'detail', 'additionalTextEdits'],
            },
          },
        },
        hover: {
          contentFormat: ['markdown', 'plaintext'],
        },
        definition: {},
        signatureHelp: {
          signatureInformation: {
            documentationFormat: ['markdown', 'plaintext'],
            parameterInformation: {
              labelOffsetSupport: true,
            },
          },
        },
        publishDiagnostics: {
          relatedInformation: true,
          tagSupport: { valueSet: [1, 2] },
        },
      },
    }

    const result = await this.request<{ capabilities: ServerCapabilities }>('initialize', {
      processId: null,
      rootUri,
      capabilities: capabilities || defaultCapabilities,
      workspaceFolders: [{ uri: rootUri, name: 'workspace' }],
    })

    this.serverCapabilities = result.capabilities
    this.notify('initialized', {})
    return result.capabilities
  }

  async shutdown(): Promise<void> {
    try {
      await this.request('shutdown', null)
      this.notify('exit', null)
    } catch {
      // Server may already be gone
    }
  }

  // --- Document Lifecycle ---

  didOpen(uri: string, languageId: string, text: string): void {
    this.documentVersions.set(uri, 1)
    this.notify('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId,
        version: 1,
        text,
      },
    })
  }

  didChange(uri: string, text: string): void {
    const version = (this.documentVersions.get(uri) || 0) + 1
    this.documentVersions.set(uri, version)
    this.notify('textDocument/didChange', {
      textDocument: { uri, version },
      contentChanges: [{ text }], // Full document sync
    })
  }

  didClose(uri: string): void {
    this.documentVersions.delete(uri)
    this.notify('textDocument/didClose', {
      textDocument: { uri },
    })
  }

  didSave(uri: string, text: string): void {
    this.notify('textDocument/didSave', {
      textDocument: { uri },
      text,
    })
  }

  // --- Feature Requests ---

  async completion(uri: string, position: Position): Promise<CompletionList | null> {
    try {
      const result = await this.request('textDocument/completion', {
        textDocument: { uri },
        position,
      })
      if (!result) return null
      // Server may return CompletionItem[] or CompletionList
      if (Array.isArray(result)) {
        return { isIncomplete: false, items: result }
      }
      return result
    } catch {
      return null
    }
  }

  async hover(uri: string, position: Position): Promise<Hover | null> {
    try {
      return await this.request('textDocument/hover', {
        textDocument: { uri },
        position,
      })
    } catch {
      return null
    }
  }

  async definition(uri: string, position: Position): Promise<Location | Location[] | null> {
    try {
      return await this.request('textDocument/definition', {
        textDocument: { uri },
        position,
      })
    } catch {
      return null
    }
  }

  async signatureHelp(uri: string, position: Position): Promise<SignatureHelp | null> {
    try {
      return await this.request('textDocument/signatureHelp', {
        textDocument: { uri },
        position,
      })
    } catch {
      return null
    }
  }

  async resolveCompletionItem(item: any): Promise<any> {
    try {
      return await this.request('completionItem/resolve', item)
    } catch {
      return item
    }
  }

  // --- Callbacks ---

  onDiagnostics(cb: DiagnosticsCallback): void {
    this.diagnosticsCallback = cb
  }

  onLog(cb: LogCallback): void {
    this.logCallback = cb
  }

  // --- Cleanup ---

  dispose(): void {
    // Reject all pending requests
    for (const [id, { reject, method, timeout }] of this.pendingRequests) {
      clearTimeout(timeout)
      reject(new Error(`LSP client disposed while "${method}" was pending`))
    }
    this.pendingRequests.clear()
    this.documentVersions.clear()
    this.serverId = null
    this.diagnosticsCallback = null
    this.logCallback = null
    this.serverCapabilities = null
  }
}
