import { setup, assign, enqueueActions } from 'xstate'
import { emit } from '@/core/helpers/actor-helpers'
import { rootEvents } from '@/core/router/bus-emitter'
import { systemBus } from '@/core/helpers/event-helpers'
import { z } from 'zod'
import { lspService } from './process-manager'
import { findConfigForLanguage } from './config'

const pluginId = 'code' as const
const busEvent = systemBus(pluginId)

// Incoming events from frontend
export const IncomingLspEvents = [
  busEvent('lsp.TO_SERVER', {
    serverId: z.string(),
    message: z.string(),
  }),
  busEvent('lsp.START_SERVER', {
    languageId: z.string(),
  }),
  busEvent('lsp.STOP_SERVER', {
    serverId: z.string(),
  }),
] as const

// Outgoing events to frontend
export type OutgoingLspEvents =
  | { type: 'lsp.FROM_SERVER'; data: { serverId: string; message: string } }
  | { type: 'lsp.SERVER_STARTED'; data: { serverId: string; languageId: string } }
  | { type: 'lsp.SERVER_STOPPED'; data: { serverId: string; languageId: string } }
  | { type: 'lsp.SERVER_ERROR'; data: { serverId: string; error: string } }
  | { type: 'lsp.SERVERS_LISTED'; data: Array<{ serverId: string; languageId: string; status: string }> }

export interface Context {
  baseDirectory: string | null
}

export type Event =
  | { type: 'lsp.TO_SERVER'; serverId: string; message: string }
  | { type: 'lsp.START_SERVER'; languageId: string }
  | { type: 'lsp.STOP_SERVER'; serverId: string }
  | { type: 'lsp.UPDATE_BASE_DIRECTORY'; path: string }
  | { type: 'CODE_CONNECTED' }

export const lspSystem = setup({
  types: {
    context: {} as Context,
    events: {} as Event,
    input: {} as { baseDirectory: string | null }
  },
  guards: {
    isNewBaseDirectory: ({ context, event }) => {
      const ev = event as { type: 'lsp.UPDATE_BASE_DIRECTORY'; path: string }
      return ev.path !== context.baseDirectory
    }
  },
  actions: {
    sendConnectedData: () => {
      const servers = lspService.list()
      const wrapped = emit(pluginId, {
        type: 'lsp.SERVERS_LISTED',
        data: servers
      })
      rootEvents.emitOutgoing(wrapped.event)
    },

    startServer: ({ event, context }) => {
      const ev = event as { type: 'lsp.START_SERVER'; languageId: string }
      const config = findConfigForLanguage(ev.languageId)
      console.log('[LSP:Backend] startServer — languageId:', ev.languageId, 'configFound:', !!config, 'baseDirectory:', context.baseDirectory)

      if (!config) {
        const wrapped = emit(pluginId, {
          type: 'lsp.SERVER_ERROR',
          data: { serverId: '', error: `No language server configured for "${ev.languageId}"` }
        })
        rootEvents.emitOutgoing(wrapped.event)
        return
      }

      // Check if a server for this language is already running
      const existingServerId = lspService.findServerForLanguage(config.id)
      if (existingServerId) {
        const wrapped = emit(pluginId, {
          type: 'lsp.SERVER_STARTED',
          data: { serverId: existingServerId, languageId: config.id }
        })
        rootEvents.emitOutgoing(wrapped.event)
        return
      }

      if (!context.baseDirectory) {
        const wrapped = emit(pluginId, {
          type: 'lsp.SERVER_ERROR',
          data: { serverId: '', error: 'No workspace directory set' }
        })
        rootEvents.emitOutgoing(wrapped.event)
        return
      }

      try {
        const serverId = lspService.spawn(config, context.baseDirectory)

        // Wire up message callback → emit to frontend
        lspService.onMessage(serverId, (message) => {
          const wrapped = emit(pluginId, {
            type: 'lsp.FROM_SERVER',
            data: { serverId, message }
          })
          rootEvents.emitOutgoing(wrapped.event)
        })

        // Wire up error callback → emit to frontend
        lspService.onError(serverId, (error) => {
          const wrapped = emit(pluginId, {
            type: 'lsp.SERVER_ERROR',
            data: { serverId, error }
          })
          rootEvents.emitOutgoing(wrapped.event)
        })

        // Wire up exit callback
        lspService.onExit(serverId, (code) => {
          const wrapped = emit(pluginId, {
            type: 'lsp.SERVER_STOPPED',
            data: { serverId, languageId: config.id }
          })
          rootEvents.emitOutgoing(wrapped.event)
        })

        // Notify frontend of successful start
        const wrapped = emit(pluginId, {
          type: 'lsp.SERVER_STARTED',
          data: { serverId, languageId: config.id }
        })
        rootEvents.emitOutgoing(wrapped.event)
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'lsp.SERVER_ERROR',
          data: { serverId: '', error: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    stopServer: ({ event }) => {
      const ev = event as { type: 'lsp.STOP_SERVER'; serverId: string }
      lspService.kill(ev.serverId)
    },

    forwardToServer: ({ event }) => {
      const ev = event as { type: 'lsp.TO_SERVER'; serverId: string; message: string }
      try {
        const parsed = JSON.parse(ev.message)
        console.log('[LSP:Backend] forwardToServer — serverId:', ev.serverId, 'method:', parsed.method || `response id:${parsed.id}`)
      } catch { /* ignore */ }
      const success = lspService.send(ev.serverId, ev.message)
      if (!success) {
        const wrapped = emit(pluginId, {
          type: 'lsp.SERVER_ERROR',
          data: { serverId: ev.serverId, error: 'Failed to send message to server' }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    updateBaseDirectory: enqueueActions(({ enqueue, event }) => {
      const ev = event as { type: 'lsp.UPDATE_BASE_DIRECTORY'; path: string }

      // Kill all running servers — they hold state tied to the old rootUri
      const servers = lspService.list()
      for (const server of servers) {
        lspService.kill(server.serverId)
        const wrapped = emit(pluginId, {
          type: 'lsp.SERVER_STOPPED',
          data: { serverId: server.serverId, languageId: server.languageId }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }

      enqueue.assign({ baseDirectory: () => ev.path })
    }),

    cleanupServers: () => {
      lspService.killAll()
    }
  }
}).createMachine({
  id: 'lsp',
  initial: 'idle',
  context: ({ input }: { input?: { baseDirectory: string | null } }) => ({
    baseDirectory: input?.baseDirectory || null
  }),
  exit: 'cleanupServers',
  states: {
    idle: {
      on: {
        'CODE_CONNECTED': {
          actions: 'sendConnectedData'
        },
        'lsp.START_SERVER': {
          actions: 'startServer'
        },
        'lsp.STOP_SERVER': {
          actions: 'stopServer'
        },
        'lsp.TO_SERVER': {
          actions: 'forwardToServer'
        },
        'lsp.UPDATE_BASE_DIRECTORY': {
          guard: 'isNewBaseDirectory',
          actions: 'updateBaseDirectory'
        }
      }
    }
  }
})
