import { setup, assign, enqueueActions } from 'xstate'
import { trpc } from '@/core/trpc'
import { LspClient } from './lsp-client'
import { MonacoLspBridge } from './monaco-lsp-bridge'

type Monaco = typeof import('monaco-editor')

const sendToBackend = (type: string, data: any) => {
  trpc.bus.send.mutate({
    systemId: 'code' as any,
    type: type as any,
    ...data
  } as any)
}

interface LspServerInfo {
  serverId: string
  languageId: string
  status: string
}

export interface Context {
  lspClient: LspClient | null
  monacoLspBridge: MonacoLspBridge | null
  baseDirectory: string | null
  servers: LspServerInfo[]
  initialized: boolean
  handshakeComplete: boolean
  error: string | null
}

export type Event =
  | { type: 'lsp.INIT'; baseDirectory: string }
  | { type: 'lsp.FROM_SERVER'; data: { serverId: string; message: string } }
  | { type: 'lsp.SERVER_STARTED'; data: { serverId: string; languageId: string } }
  | { type: 'lsp.SERVER_STOPPED'; data: { serverId: string; languageId: string } }
  | { type: 'lsp.SERVER_ERROR'; data: { serverId: string; error: string } }
  | { type: 'lsp.SERVERS_LISTED'; data: LspServerInfo[] }
  | { type: 'lsp.INITIALIZED' }
  | { type: 'lsp.MONACO_READY' }

function buildFileUri(path: string): string {
  const url = new URL('file:///')
  url.pathname = path
  return url.href
}

export const lspState = setup({
  types: {
    context: {} as Context,
    events: {} as Event
  },
  actions: {
    initializeLsp: enqueueActions(({ event, enqueue }) => {
      const ev = event as { type: 'lsp.INIT'; baseDirectory: string }
      if (!ev.baseDirectory) return

      console.log('[LSP:State] initializeLsp — baseDirectory:', ev.baseDirectory)

      enqueue.assign({
        lspClient: () => new LspClient(),
        baseDirectory: () => ev.baseDirectory,
        error: () => null,
      })

      sendToBackend('lsp.START_SERVER', { languageId: 'typescript' })
    }),

    handleServerStarted: enqueueActions(({ context, self, event, enqueue }) => {
      const ev = event as { type: 'lsp.SERVER_STARTED'; data: { serverId: string; languageId: string } }
      console.log('[LSP:State] handleServerStarted — serverId:', ev.data.serverId, 'languageId:', ev.data.languageId, 'clientExists:', !!context.lspClient, 'baseDir:', context.baseDirectory)
      if (!context.lspClient || !context.baseDirectory) return

      const client = context.lspClient
      client.setServerId(ev.data.serverId)

      enqueue.assign({
        servers: ({ context: ctx }) => [...ctx.servers, {
          serverId: ev.data.serverId,
          languageId: ev.data.languageId,
          status: 'running'
        }]
      })

      const rootUri = buildFileUri(context.baseDirectory)
      client.initialize(rootUri).then(() => {
        self.send({ type: 'lsp.INITIALIZED' })
      }).catch((err: any) => {
        console.error('[LSP] Initialize handshake failed:', err)
        self.send({
          type: 'lsp.SERVER_ERROR',
          data: { serverId: ev.data.serverId, error: err.message || 'Failed to initialize' }
        })
      })
    }),

    handleInitialized: assign(() => {
      console.log('[LSP:State] handleInitialized — handshake complete')
      return { handshakeComplete: true }
    }),

    attemptBridgeCreation: assign(({ context, self }) => {
      const hasClient = !!context.lspClient
      const hasHandshake = context.handshakeComplete
      const hasBridge = !!context.monacoLspBridge
      const hasMonaco = !!(window as any).monaco
      console.log('[LSP:State] attemptBridgeCreation — client:', hasClient, 'handshake:', hasHandshake, 'bridgeExists:', hasBridge, 'monaco:', hasMonaco)

      if (!context.lspClient || !context.handshakeComplete) return {}
      if (context.monacoLspBridge) return {} // already created
      const monaco = (window as any).monaco as Monaco
      if (!monaco) return {}

      console.log('[LSP:State] attemptBridgeCreation → CREATING bridge')
      disableBuiltinTsDiagnostics(monaco)
      const supportedLanguages = ['typescript', 'javascript', 'typescriptreact', 'javascriptreact']
      const bridge = new MonacoLspBridge(monaco, context.lspClient, supportedLanguages, (filePath, line, column) => {
        // Access the parent code plugin's explorer actor to open files
        try {
          const explorerActor = (self as any)._parent?.system?.get('explorer')
          explorerActor?.send({ type: 'explorer.OPEN_FILE', path: filePath, line, column })
        } catch {
          sendToBackend('explorer.READ_FILE', { path: filePath })
        }
      })
      bridge.start()

      return { monacoLspBridge: bridge, initialized: true }
    }),

    forwardServerMessage: ({ context, event }) => {
      const ev = event as { type: 'lsp.FROM_SERVER'; data: { serverId: string; message: string } }
      try {
        const parsed = JSON.parse(ev.data.message)
        console.log('[LSP:State] forwardServerMessage —', parsed.method ? `notification: ${parsed.method}` : `response id: ${parsed.id}`)
      } catch { /* ignore parse errors for logging */ }
      context.lspClient?.handleServerMessage(ev.data.message)
    },

    handleServerStopped: enqueueActions(({ context, event, enqueue }) => {
      const ev = event as { type: 'lsp.SERVER_STOPPED'; data: { serverId: string; languageId: string } }
      const wasActive = context.lspClient?.getServerId() === ev.data.serverId

      if (wasActive) {
        context.monacoLspBridge?.dispose()
        context.lspClient?.dispose()
        const monaco = (window as any).monaco as Monaco
        if (monaco) enableBuiltinTsDiagnostics(monaco)

        enqueue.assign({
          monacoLspBridge: () => null,
          lspClient: () => null,
          initialized: () => false,
        })
      }

      enqueue.assign({
        servers: ({ context: ctx }) => ctx.servers.filter(s => s.serverId !== ev.data.serverId),
      })
    }),

    handleServerError: assign(({ event }) => {
      const ev = event as { type: 'lsp.SERVER_ERROR'; data: { serverId: string; error: string } }
      console.warn('[LSP] Server error:', ev.data.error)
      return { error: ev.data.error }
    }),

    handleServersListed: assign({
      servers: ({ event }) => {
        const ev = event as { type: 'lsp.SERVERS_LISTED'; data: LspServerInfo[] }
        return ev.data
      }
    }),

    cleanup: enqueueActions(({ context, enqueue }) => {
      context.monacoLspBridge?.dispose()
      context.lspClient?.dispose()
      const monaco = (window as any).monaco as Monaco
      if (monaco) enableBuiltinTsDiagnostics(monaco)

      enqueue.assign({
        monacoLspBridge: () => null,
        lspClient: () => null,
        initialized: () => false,
        handshakeComplete: () => false,
      })
    })
  }
}).createMachine({
  id: 'lsp',
  initial: 'idle',
  context: {
    lspClient: null,
    monacoLspBridge: null,
    baseDirectory: null,
    servers: [],
    initialized: false,
    handshakeComplete: false,
    error: null,
  },
  exit: 'cleanup',
  states: {
    idle: {
      on: {
        'lsp.INIT': {
          target: 'active',
          actions: 'initializeLsp'
        },
        'lsp.SERVERS_LISTED': {
          actions: 'handleServersListed'
        },
        'lsp.MONACO_READY': {} // no-op in idle
      }
    },
    active: {
      on: {
        'lsp.FROM_SERVER': {
          actions: 'forwardServerMessage'
        },
        'lsp.SERVER_STARTED': {
          actions: 'handleServerStarted'
        },
        'lsp.INITIALIZED': {
          actions: ['handleInitialized', 'attemptBridgeCreation']
        },
        'lsp.MONACO_READY': {
          actions: 'attemptBridgeCreation'
        },
        'lsp.SERVER_STOPPED': {
          actions: 'handleServerStopped'
        },
        'lsp.SERVER_ERROR': {
          actions: 'handleServerError'
        },
        'lsp.SERVERS_LISTED': {
          actions: 'handleServersListed'
        },
        'lsp.INIT': {
          // Re-init (directory change): cleanup and restart
          actions: ['cleanup', 'initializeLsp']
        }
      }
    }
  }
})

// --- Monaco Built-in Diagnostic Control ---

function disableBuiltinTsDiagnostics(monaco: Monaco): void {
  try {
    const diagnosticsOff = {
      noSemanticValidation: true,
      noSuggestionDiagnostics: true,
      noSyntaxValidation: false,
    }
    monaco.languages.typescript?.typescriptDefaults?.setDiagnosticsOptions(diagnosticsOff)
    monaco.languages.typescript?.javascriptDefaults?.setDiagnosticsOptions(diagnosticsOff)
  } catch {
    // Monaco TS not available
  }
}

function enableBuiltinTsDiagnostics(monaco: Monaco): void {
  try {
    const diagnosticsOn = {
      noSemanticValidation: false,
      noSuggestionDiagnostics: false,
      noSyntaxValidation: false,
    }
    monaco.languages.typescript?.typescriptDefaults?.setDiagnosticsOptions(diagnosticsOn)
    monaco.languages.typescript?.javascriptDefaults?.setDiagnosticsOptions(diagnosticsOn)
  } catch {
    // Monaco TS not available
  }
}
