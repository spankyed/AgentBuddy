import { setup } from 'xstate'
import { emit } from '@/core/utils/actor-helpers'
import { rootEvents } from '@/core/router/bus-emitter'
import { systemBus } from '@/core/utils/event-helpers'
import { z } from 'zod'
import { terminalService } from '../../services/terminal'
import { TerminalInfo } from '../../types'

const pluginId = 'code' as const
const busEvent = systemBus(pluginId)

// Incoming events from frontend
export const IncomingTerminalEvents = [
  busEvent('terminal.CREATE_TERMINAL', {
    title: z.string().optional(),
    cwd: z.string().optional(),
    shell: z.string().optional(),
    cols: z.number().optional(),
    rows: z.number().optional()
  }),
  busEvent('terminal.CLOSE_TERMINAL', { terminalId: z.string() }),
  busEvent('terminal.TERMINAL_INPUT', { terminalId: z.string(), data: z.string() }),
  busEvent('terminal.RESIZE_TERMINAL', { terminalId: z.string(), cols: z.number(), rows: z.number() }),
  busEvent('terminal.REFRESH_LIST', {}),
] as const

// Outgoing events to frontend
export type OutgoingTerminalEvents =
  | { type: 'terminal.CREATED'; data: TerminalInfo }
  | { type: 'terminal.OUTPUT'; data: { terminalId: string; data: string } }
  | { type: 'terminal.INITIAL_OUTPUT'; data: { terminalId: string; data: string } }
  | { type: 'terminal.CLOSED'; data: { terminalId: string } }
  | { type: 'terminal.ERROR'; data: { message: string; terminalId?: string } }
  | { type: 'terminal.TERMINALS_LISTED'; data: TerminalInfo[] }

export interface Context {
  currentDirectory: string
}

export type Event = 
  | { type: 'terminal.CREATE_TERMINAL'; 
      title?: string;
      cwd?: string;
      shell?: string;
      cols?: number;
      rows?: number;
    }
  | { type: 'terminal.CLOSE_TERMINAL'; terminalId: string }
  | { type: 'terminal.TERMINAL_INPUT'; terminalId: string; data: string }
  | { type: 'terminal.RESIZE_TERMINAL'; terminalId: string; cols: number; rows: number }
  | { type: 'terminal.REFRESH_LIST' }
  | { type: 'terminal.UPDATE_CURRENT_DIRECTORY'; path: string }
  | { type: 'CODE_STARTUP' };

export const terminalSystem = setup({
  types: {
    context: {} as Context,
    events: {} as Event,
    input: {} as { currentDirectory: string }
  },
  actions: {
    sendStartupData: () => {
      // Send terminal list and trigger tab restoration
      const terminals = terminalService.list()
      
      const wrapped = emit(pluginId, {
        type: 'CODE_STARTUP',
        data: { terminals }
      })
      rootEvents.emitOutgoing(wrapped.event)
    },

    createTerminal: ({ event, context }) => {
      const ev = event as { 
        type: 'terminal.CREATE_TERMINAL'; 
        title?: string;
        cwd?: string;
        shell?: string;
        cols?: number;
        rows?: number;
      }
      try {
        const terminalInfo = terminalService.create({
          title: ev.title,
          cwd: ev.cwd || context.currentDirectory,
          shell: ev.shell,
          cols: ev.cols || 80,
          rows: ev.rows || 24
        })

        // Set up output handler
        terminalService.onData(terminalInfo.id, (data) => {
          // Send to frontend
          const wrapped = emit(pluginId, {
            type: 'terminal.OUTPUT',
            data: { terminalId: terminalInfo.id, data }
          })
          rootEvents.emitOutgoing(wrapped.event)
        })

        // Set up exit handler
        terminalService.onExit(terminalInfo.id, (exitCode, signal) => {
          const wrapped = emit(pluginId, {
            type: 'terminal.CLOSED',
            data: { terminalId: terminalInfo.id }
          })
          rootEvents.emitOutgoing(wrapped.event)
        })

        const wrapped = emit(pluginId, {
          type: 'terminal.CREATED',
          data: terminalInfo
        })
        rootEvents.emitOutgoing(wrapped.event)
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'terminal.ERROR',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    closeTerminal: ({ event }) => {
      const ev = event as { type: 'terminal.CLOSE_TERMINAL'; terminalId: string }
      try {
        const success = terminalService.kill(ev.terminalId)
        if (!success) {
          const wrapped = emit(pluginId, {
            type: 'terminal.ERROR',
            data: { message: `Terminal ${ev.terminalId} not found`, terminalId: ev.terminalId }
          })
          rootEvents.emitOutgoing(wrapped.event)
        }
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'terminal.ERROR',
          data: { message: error.message, terminalId: ev.terminalId }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    sendTerminalInput: ({ event }) => {
      const ev = event as { type: 'terminal.TERMINAL_INPUT'; terminalId: string; data: string }
      try {
        const success = terminalService.write(ev.terminalId, ev.data)
        if (!success) {
          const wrapped = emit(pluginId, {
            type: 'terminal.ERROR',
            data: { message: `Terminal ${ev.terminalId} not found`, terminalId: ev.terminalId }
          })
          rootEvents.emitOutgoing(wrapped.event)
        }
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'terminal.ERROR',
          data: { message: error.message, terminalId: ev.terminalId }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    resizeTerminal: ({ event }) => {
      const ev = event as { type: 'terminal.RESIZE_TERMINAL'; terminalId: string; cols: number; rows: number }
      try {
        const success = terminalService.resize(ev.terminalId, ev.cols, ev.rows)
        if (!success) {
          const wrapped = emit(pluginId, {
            type: 'terminal.ERROR',
            data: { message: `Terminal ${ev.terminalId} not found`, terminalId: ev.terminalId }
          })
          rootEvents.emitOutgoing(wrapped.event)
        }
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'terminal.ERROR',
          data: { message: error.message, terminalId: ev.terminalId }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    listTerminals: () => {
      try {
        const terminals = terminalService.list()
        const wrapped = emit(pluginId, {
          type: 'terminal.TERMINALS_LISTED',
          data: terminals
        })
        rootEvents.emitOutgoing(wrapped.event)
      } catch (error: any) {
        const wrapped = emit(pluginId, {
          type: 'terminal.ERROR',
          data: { message: error.message }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    cleanupTerminals: () => {
      terminalService.killAll()
    },

    restoreTerminals: async () => {
      // Restore all active terminals from EARS
      await terminalService.restoreAll((terminalInfo) => {
        // Set up output handler for restored terminal
        terminalService.onData(terminalInfo.id, (data) => {
          const wrapped = emit(pluginId, {
            type: 'terminal.OUTPUT',
            data: { terminalId: terminalInfo.id, data }
          })
          rootEvents.emitOutgoing(wrapped.event)
        })

        // Set up exit handler for restored terminal
        terminalService.onExit(terminalInfo.id, (exitCode, signal) => {
          const wrapped = emit(pluginId, {
            type: 'terminal.CLOSED',
            data: { terminalId: terminalInfo.id }
          })
          rootEvents.emitOutgoing(wrapped.event)
        })
      })
      
      console.log('Terminal restoration complete')
    },

    updateCurrentDirectory: ({ event, context }) => {
      const ev = event as { type: 'terminal.UPDATE_CURRENT_DIRECTORY'; path: string }
      context.currentDirectory = ev.path
    }
  }
}).createMachine({
  id: 'terminal',
  initial: 'idle',
  context: ({ input }: { input?: { currentDirectory: string } }) => ({
    currentDirectory: input?.currentDirectory || process.cwd()
  }),
  entry: 'restoreTerminals',
  exit: 'cleanupTerminals',
  states: {
    idle: {
      on: {
        'CODE_STARTUP': {
          actions: 'sendStartupData'
        },
        'terminal.CREATE_TERMINAL': {
          actions: 'createTerminal'
        },
        'terminal.CLOSE_TERMINAL': {
          actions: 'closeTerminal'
        },
        'terminal.TERMINAL_INPUT': {
          actions: 'sendTerminalInput'
        },
        'terminal.RESIZE_TERMINAL': {
          actions: 'resizeTerminal'
        },
        'terminal.REFRESH_LIST': {
          actions: 'listTerminals'
        },
        'terminal.UPDATE_CURRENT_DIRECTORY': {
          actions: 'updateCurrentDirectory'
        }
      }
    }
  }
})