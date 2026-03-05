import { setup, assign } from 'xstate'
import { emit } from '@/core/helpers/actor-helpers'
import { rootEvents } from '@/core/router/bus-emitter'
import { systemBus } from '@/core/helpers/event-helpers'
import { z } from 'zod'
import { terminalService } from '../services/terminal'
import { TerminalInfo, CodeSettings } from '../types'
import { repository } from '@/repository'

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
  busEvent('terminal.RENAME_TERMINAL', { terminalId: z.string(), customTitle: z.string() }),
  busEvent('terminal.REFRESH_LIST', {}),
  busEvent('terminal.OPEN_TERMINAL_TAB', { terminalId: z.string() }),
] as const

// Outgoing events to frontend
export type OutgoingTerminalEvents =
  | { type: 'terminal.CREATED'; data: TerminalInfo }
  | { type: 'terminal.OUTPUT'; data: { terminalId: string; data: string } }
  | { type: 'terminal.INITIAL_OUTPUT'; data: { terminalId: string; data: string } }
  | { type: 'terminal.CLOSED'; data: { terminalId: string } }
  | { type: 'terminal.RENAMED'; data: { terminalId: string; customTitle: string } }
  | { type: 'terminal.CWD_CHANGED'; data: { terminalId: string; cwd: string; title?: string } }
  | { type: 'terminal.ERROR'; data: { message: string; terminalId?: string } }
  | { type: 'terminal.TERMINALS_LISTED'; data: TerminalInfo[] }
  | { type: 'terminal.TERMINAL_TAB_OPENED'; data: TerminalInfo }

export interface Context {
  baseDirectory: string | null
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
  | { type: 'terminal.RENAME_TERMINAL'; terminalId: string; customTitle: string }
  | { type: 'terminal.REFRESH_LIST' }
  | { type: 'terminal.OPEN_TERMINAL_TAB'; terminalId: string }
  | { type: 'terminal.UPDATE_BASE_DIRECTORY'; path: string }
  | { type: 'CODE_CONNECTED' };

export const terminalSystem = setup({
  types: {
    context: {} as Context,
    events: {} as Event,
    input: {} as { baseDirectory: string | null }
  },
  actions: {
    sendConnectedData: ({ context }) => {
      // Send terminal list and trigger tab restoration
      const terminals = terminalService.list()
      
      const wrapped = emit(pluginId, {
        type: 'terminal.TERMINALS_LISTED',
        data: terminals
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
        const cwd = ev.cwd || context.baseDirectory
        const terminalInfo = terminalService.create({
          title: ev.title,
          cwd: cwd && cwd.trim() ? cwd : undefined,
          shell: ev.shell,
          cols: ev.cols || 80,
          rows: ev.rows || 24
        })

        // Set up output handler
        terminalService.onData(terminalInfo.id, (data) => {
          // Check for OSC sequences indicating directory change
          // OSC 7: \033]7;file://hostname/path\007 (or \033]7;file://hostname/path\033\\)
          // OSC 633;P: \033]633;P;Cwd=/path\007
          // OSC 1337: \033]1337;CurrentDir=/path\007
          const osc7Match = data.match(/\x1b\]7;file:\/\/[^\/]*(\/.+?)(?:\x07|\x1b\\)/)
          const osc633Match = data.match(/\x1b\]633;P;Cwd=(.+?)(?:\x07|\x1b\\)/)
          const osc1337Match = data.match(/\x1b\]1337;CurrentDir=(.+?)(?:\x07|\x1b\\)/)

          const cwdMatch = osc7Match || osc633Match || osc1337Match

          if (cwdMatch) {
            try {
              const newCwd = decodeURIComponent(cwdMatch[1])
              const result = terminalService.updateCwd(terminalInfo.id, newCwd)

              if (result) {
                // Emit CWD change event to frontend
                const cwdWrapped = emit(pluginId, {
                  type: 'terminal.CWD_CHANGED',
                  data: {
                    terminalId: terminalInfo.id,
                    cwd: result.cwd,
                    title: result.title
                  }
                })
                rootEvents.emitOutgoing(cwdWrapped.event)
              }
            } catch (error) {
              console.error('Failed to parse CWD from OSC sequence:', error)
            }
          }

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
        const terminal = terminalService.get(ev.terminalId)
        const terminalName = terminal ? terminal.info.title : 'Terminal'
        const success = terminalService.kill(ev.terminalId)
        if (!success) {
          const wrapped = emit(pluginId, {
            type: 'terminal.ERROR',
            data: { message: `${terminalName} not found`, terminalId: ev.terminalId }
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
        const terminal = terminalService.get(ev.terminalId)
        const terminalName = terminal ? terminal.info.title : 'Terminal'
        const success = terminalService.write(ev.terminalId, ev.data)
        if (!success) {
          const wrapped = emit(pluginId, {
            type: 'terminal.ERROR',
            data: { message: `${terminalName} not found`, terminalId: ev.terminalId }
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
        const terminal = terminalService.get(ev.terminalId)
        const terminalName = terminal ? terminal.info.title : 'Terminal'
        const success = terminalService.resize(ev.terminalId, ev.cols, ev.rows)
        if (!success) {
          const wrapped = emit(pluginId, {
            type: 'terminal.ERROR',
            data: { message: `${terminalName} not found`, terminalId: ev.terminalId }
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

    renameTerminal: ({ event }) => {
      const ev = event as { type: 'terminal.RENAME_TERMINAL'; terminalId: string; customTitle: string }
      try {
        const terminal = terminalService.get(ev.terminalId)
        const terminalName = terminal ? terminal.info.title : 'Terminal'
        const success = terminalService.rename(ev.terminalId, ev.customTitle)
        if (!success) {
          const wrapped = emit(pluginId, {
            type: 'terminal.ERROR',
            data: { message: `${terminalName} not found`, terminalId: ev.terminalId }
          })
          rootEvents.emitOutgoing(wrapped.event)
        } else {
          // Emit success event
          const wrapped = emit(pluginId, {
            type: 'terminal.RENAMED',
            data: { terminalId: ev.terminalId, customTitle: ev.customTitle }
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

    openTerminalTab: ({ event }) => {
      const ev = event as { type: 'terminal.OPEN_TERMINAL_TAB'; terminalId: string }
      try {
        const terminals = terminalService.list()
        const terminal = terminals.find(t => t.id === ev.terminalId)
        
        if (terminal) {
          const wrapped = emit(pluginId, {
            type: 'terminal.TERMINAL_TAB_OPENED',
            data: terminal
          })
          rootEvents.emitOutgoing(wrapped.event)
        } else {
          const wrapped = emit(pluginId, {
            type: 'terminal.ERROR',
            data: { 
              message: `Terminal not found`, 
              terminalId: ev.terminalId 
            }
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

    cleanupTerminals: () => {
      terminalService.killAll()
    },

    restoreTerminals: async ({ context }) => {
      // Get current settings directly from EARS - this will create default settings if they don't exist
      const codeSettings = repository.settingsQueries.getPluginSettings('code') as CodeSettings
      
      // Check if terminal restoration is enabled
      if (codeSettings?.restoreTerminals === false) {
        console.log('[Terminal] Terminal restoration disabled by settings')
        return
      }
      
      // Restore all active terminals from EARS
      await terminalService.restoreAll((terminalInfo) => {
        // Set up output handler for restored terminal
        terminalService.onData(terminalInfo.id, (data) => {
          // Check for OSC sequences indicating directory change
          const osc7Match = data.match(/\x1b\]7;file:\/\/[^\/]*(\/.+?)(?:\x07|\x1b\\)/)
          const osc633Match = data.match(/\x1b\]633;P;Cwd=(.+?)(?:\x07|\x1b\\)/)
          const osc1337Match = data.match(/\x1b\]1337;CurrentDir=(.+?)(?:\x07|\x1b\\)/)

          const cwdMatch = osc7Match || osc633Match || osc1337Match

          if (cwdMatch) {
            try {
              const newCwd = decodeURIComponent(cwdMatch[1])
              const result = terminalService.updateCwd(terminalInfo.id, newCwd)

              if (result) {
                // Emit CWD change event to frontend
                const cwdWrapped = emit(pluginId, {
                  type: 'terminal.CWD_CHANGED',
                  data: {
                    terminalId: terminalInfo.id,
                    cwd: result.cwd,
                    title: result.title
                  }
                })
                rootEvents.emitOutgoing(cwdWrapped.event)
              }
            } catch (error) {
              console.error('Failed to parse CWD from OSC sequence:', error)
            }
          }

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

    updateBaseDirectory: assign({
      baseDirectory: ({ event }) => {
        const ev = event as { type: 'terminal.UPDATE_BASE_DIRECTORY'; path: string }
        return ev.path
      }
    })
  }
}).createMachine({
  id: 'terminal',
  initial: 'idle',
  context: ({ input }: { input?: { baseDirectory: string | null } }) => ({
    baseDirectory: input?.baseDirectory || null
  }),
  entry: 'restoreTerminals',
  exit: 'cleanupTerminals',
  states: {
    idle: {
      on: {
        'CODE_CONNECTED': {
          actions: 'sendConnectedData'
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
        'terminal.RENAME_TERMINAL': {
          actions: 'renameTerminal'
        },
        'terminal.REFRESH_LIST': {
          actions: 'listTerminals'
        },
        'terminal.OPEN_TERMINAL_TAB': {
          actions: 'openTerminalTab'
        },
        'terminal.UPDATE_BASE_DIRECTORY': {
          actions: 'updateBaseDirectory'
        }
      }
    }
  }
})