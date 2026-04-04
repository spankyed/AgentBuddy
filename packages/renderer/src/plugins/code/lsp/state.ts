import { setup, assign } from 'xstate'
import { trpc } from '@/core/trpc'
import { LspClient } from './lsp-client'
import { MonacoLspBridge } from './monaco-lsp-bridge'
import { getParentContext } from '../utils/parent-communication'

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
  servers: LspServerInfo[]
  initialized: boolean
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

export const lspState = setup({
  types: {
    context: {} as Context,
    events: {} as Event
  },
  actions: {
    initializeLsp: ({ context, self }) => {
      const parentContext = getParentContext(self)
      const baseDirectory = parentContext?.baseDirectory
      if (!baseDirectory) return

      // Create LspClient
      const client = new LspClient()

      // Update context manually since assign can't be used inside action bodies with side effects
      context.lspClient = client
      context.error = null

      // Request the TypeScript language server
      sendToBackend('lsp.START_SERVER', { languageId: 'typescript' })
    },

    handleServerStarted: ({ context, self, event }) => {
      const ev = event as { type: 'lsp.SERVER_STARTED'; data: { serverId: string; languageId: string } }
      const parentContext = getParentContext(self)
      const baseDirectory = parentContext?.baseDirectory

      if (!context.lspClient || !baseDirectory) return

      const client = context.lspClient
      client.setServerId(ev.data.serverId)

      // Track server
      context.servers = [...context.servers, {
        serverId: ev.data.serverId,
        languageId: ev.data.languageId,
        status: 'running'
      }]

      // Kick off async LSP initialize handshake — send internal event when done
      const rootUri = `file://${baseDirectory}`
      client.initialize(rootUri).then(() => {
        self.send({ type: 'lsp.INITIALIZED' })
      }).catch((err: any) => {
        console.error('[LSP] Initialize handshake failed:', err)
        context.error = err.message || 'Failed to initialize language server'
      })
    },

    handleInitialized: ({ context }) => {
      if (!context.lspClient) return

      const monaco = (window as any).monaco as Monaco
      if (!monaco) return

      // Disable Monaco's built-in TS diagnostics to avoid duplicates with LSP
      disableBuiltinTsDiagnostics(monaco)

      const supportedLanguages = ['typescript', 'javascript', 'typescriptreact', 'javascriptreact']
      const bridge = new MonacoLspBridge(monaco, context.lspClient, supportedLanguages)
      bridge.start() // Begin tracking models now that server is ready
      context.monacoLspBridge = bridge
      context.initialized = true
    },

    forwardServerMessage: ({ context, event }) => {
      const ev = event as { type: 'lsp.FROM_SERVER'; data: { serverId: string; message: string } }
      context.lspClient?.handleServerMessage(ev.data.message)
    },

    handleServerStopped: ({ context, event }) => {
      const ev = event as { type: 'lsp.SERVER_STOPPED'; data: { serverId: string; languageId: string } }

      // Dispose bridge if the stopped server was the active one
      if (context.lspClient?.getServerId() === ev.data.serverId) {
        context.monacoLspBridge?.dispose()
        context.monacoLspBridge = null
        context.lspClient?.dispose()
        context.lspClient = null
        context.initialized = false

        // Re-enable Monaco's built-in TS diagnostics
        const monaco = (window as any).monaco as Monaco
        if (monaco) {
          enableBuiltinTsDiagnostics(monaco)
        }
      }

      context.servers = context.servers.filter(s => s.serverId !== ev.data.serverId)
    },

    handleServerError: ({ context, event }) => {
      const ev = event as { type: 'lsp.SERVER_ERROR'; data: { serverId: string; error: string } }
      console.warn('[LSP] Server error:', ev.data.error)
      context.error = ev.data.error
    },

    handleServersListed: assign({
      servers: ({ event }) => {
        const ev = event as { type: 'lsp.SERVERS_LISTED'; data: LspServerInfo[] }
        return ev.data
      }
    }),

    cleanup: ({ context }) => {
      context.monacoLspBridge?.dispose()
      context.monacoLspBridge = null
      context.lspClient?.dispose()
      context.lspClient = null
      context.initialized = false

      const monaco = (window as any).monaco as Monaco
      if (monaco) {
        enableBuiltinTsDiagnostics(monaco)
      }
    }
  }
}).createMachine({
  id: 'lsp',
  initial: 'idle',
  context: {
    lspClient: null,
    monacoLspBridge: null,
    servers: [],
    initialized: false,
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
        }
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
          actions: 'handleInitialized'
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
      noSyntaxValidation: false, // Keep syntax validation
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
