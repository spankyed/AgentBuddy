import type { OutgoingTerminalEvents } from '../contract'
import { services } from '@/__generated__/services';
import { broadcastToPlugin } from '@/__generated__/events';
import { setup, assign, fromPromise } from 'xstate'

import { terminalService } from '../services/terminal'
import type { TerminalInfo, CodeSettings } from '../types'
import { createLogger } from '@abuddy/sdk/logger';
import { ref } from '@/__generated__/ref';

const logger = createLogger('terminal');

const pluginId = 'code' as const

// Incoming events from frontend

// Outgoing events to frontend

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

/** Emit an event to the frontend code plugin */
const emitToFrontend = (event: OutgoingTerminalEvents) => {
  broadcastToPlugin(pluginId, event)
}

// Pre-compiled regex patterns for OSC sequence detection (hot path — runs on every terminal data event)
const OSC_PATTERNS = [
  /\x1b\]7;file:\/\/[^/]*(\/.+?)(?:\x07|\x1b\\)/,       // OSC 7
  /\x1b\]633;P;Cwd=(.+?)(?:\x07|\x1b\\)/,                 // OSC 633
  /\x1b\]1337;CurrentDir=(.+?)(?:\x07|\x1b\\)/,            // OSC 1337
] as const

// Shared handler setup for terminal output/exit events (used by both create and restore)
const setupTerminalHandlers = (terminalInfo: TerminalInfo) => {
  terminalService.onData(terminalInfo.id, (data) => {
    let cwdMatch: RegExpMatchArray | null = null
    for (const pattern of OSC_PATTERNS) {
      cwdMatch = data.match(pattern)
      if (cwdMatch) break
    }

    if (cwdMatch) {
      try {
        const newCwd = decodeURIComponent(cwdMatch[1])
        const result = terminalService.updateCwd(terminalInfo.id, newCwd)
        if (result) {
          emitToFrontend({ type: 'terminal.CWD_CHANGED', data: { terminalId: terminalInfo.id, cwd: result.cwd, title: result.title } })
        }
      } catch (error) {
        logger.error('Failed to parse CWD from OSC sequence', { error })
      }
    }

    emitToFrontend({ type: 'terminal.OUTPUT', data: { terminalId: terminalInfo.id, data } })
  })

  terminalService.onExit(terminalInfo.id, () => {
    try {
      emitToFrontend({ type: 'terminal.CLOSED', data: { terminalId: terminalInfo.id } })
    } catch (error) {
      logger.error(`Error emitting CLOSED for ${terminalInfo.id}`, { error })
    }
  })
}

export const terminalSystem = setup({
  types: {
    context: {} as Context,
    events: {} as Event,
    input: {} as { baseDirectory: string | null }
  },
  actors: {
    restoreTerminalsActor: fromPromise(async () => {
      const codeSettings = services.settings.forFeature(ref('code')) as CodeSettings
      if (codeSettings?.restoreTerminals === false) {
        logger.info('Terminal restoration disabled by settings')
        return
      }
      await terminalService.restoreAll((terminalInfo) => {
        setupTerminalHandlers(terminalInfo)
      })
      logger.info('Terminal restoration complete')
    })
  },
  actions: {
    sendConnectedData: () => {
      emitToFrontend({ type: 'terminal.TERMINALS_LISTED', data: terminalService.list() })
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

        setupTerminalHandlers(terminalInfo)

        emitToFrontend({ type: 'terminal.CREATED', data: terminalInfo })
      } catch (error: any) {
        emitToFrontend({ type: 'terminal.ERROR', data: { message: error.message } })
      }
    },

    closeTerminal: ({ event }) => {
      const ev = event as { type: 'terminal.CLOSE_TERMINAL'; terminalId: string }
      try {
        const terminal = terminalService.get(ev.terminalId)
        const terminalName = terminal ? terminal.info.title : 'Terminal'
        const success = terminalService.kill(ev.terminalId)
        if (!success) {
          broadcastToPlugin(pluginId, {
            type: 'terminal.ERROR',
            data: { message: `${terminalName} not found`, terminalId: ev.terminalId }
          })
        }
      } catch (error: any) {
        broadcastToPlugin(pluginId, {
          type: 'terminal.ERROR',
          data: { message: error.message, terminalId: ev.terminalId }
        })
      }
    },

    sendTerminalInput: ({ event }) => {
      const ev = event as { type: 'terminal.TERMINAL_INPUT'; terminalId: string; data: string }
      try {
        const terminal = terminalService.get(ev.terminalId)
        const terminalName = terminal ? terminal.info.title : 'Terminal'
        const success = terminalService.write(ev.terminalId, ev.data)
        if (!success) {
          broadcastToPlugin(pluginId, {
            type: 'terminal.ERROR',
            data: { message: `${terminalName} not found`, terminalId: ev.terminalId }
          })
        }
      } catch (error: any) {
        broadcastToPlugin(pluginId, {
          type: 'terminal.ERROR',
          data: { message: error.message, terminalId: ev.terminalId }
        })
      }
    },

    resizeTerminal: ({ event }) => {
      const ev = event as { type: 'terminal.RESIZE_TERMINAL'; terminalId: string; cols: number; rows: number }
      try {
        const terminal = terminalService.get(ev.terminalId)
        const terminalName = terminal ? terminal.info.title : 'Terminal'
        const success = terminalService.resize(ev.terminalId, ev.cols, ev.rows)
        if (!success) {
          broadcastToPlugin(pluginId, {
            type: 'terminal.ERROR',
            data: { message: `${terminalName} not found`, terminalId: ev.terminalId }
          })
        }
      } catch (error: any) {
        broadcastToPlugin(pluginId, {
          type: 'terminal.ERROR',
          data: { message: error.message, terminalId: ev.terminalId }
        })
      }
    },

    renameTerminal: ({ event }) => {
      const ev = event as { type: 'terminal.RENAME_TERMINAL'; terminalId: string; customTitle: string }
      try {
        const terminal = terminalService.get(ev.terminalId)
        const terminalName = terminal ? terminal.info.title : 'Terminal'
        const success = terminalService.rename(ev.terminalId, ev.customTitle)
        if (!success) {
          broadcastToPlugin(pluginId, {
            type: 'terminal.ERROR',
            data: { message: `${terminalName} not found`, terminalId: ev.terminalId }
          })
        } else {
          // Emit success event
          broadcastToPlugin(pluginId, {
            type: 'terminal.RENAMED',
            data: { terminalId: ev.terminalId, customTitle: ev.customTitle }
          })
        }
      } catch (error: any) {
        broadcastToPlugin(pluginId, {
          type: 'terminal.ERROR',
          data: { message: error.message, terminalId: ev.terminalId }
        })
      }
    },

    listTerminals: () => {
      try {
        const terminals = terminalService.list()
        broadcastToPlugin(pluginId, {
          type: 'terminal.TERMINALS_LISTED',
          data: terminals
        })
      } catch (error: any) {
        broadcastToPlugin(pluginId, {
          type: 'terminal.ERROR',
          data: { message: error.message }
        })
      }
    },

    openTerminalTab: ({ event }) => {
      const ev = event as { type: 'terminal.OPEN_TERMINAL_TAB'; terminalId: string }
      try {
        const terminals = terminalService.list()
        const terminal = terminals.find(t => t.id === ev.terminalId)
        
        if (terminal) {
          broadcastToPlugin(pluginId, {
            type: 'terminal.TERMINAL_TAB_OPENED',
            data: terminal
          })
        } else {
          broadcastToPlugin(pluginId, {
            type: 'terminal.ERROR',
            data: { 
              message: `Terminal not found`, 
              terminalId: ev.terminalId 
            }
          })
        }
      } catch (error: any) {
        broadcastToPlugin(pluginId, {
          type: 'terminal.ERROR',
          data: { message: error.message, terminalId: ev.terminalId }
        })
      }
    },

    cleanupTerminals: () => {
      terminalService.killAll()
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
  initial: 'initializing',
  context: ({ input }: { input?: { baseDirectory: string | null } }) => ({
    baseDirectory: input?.baseDirectory || null
  }),
  exit: 'cleanupTerminals',
  // Stateless handlers safe during initialization
  on: {
    'terminal.TERMINAL_INPUT': {
      actions: 'sendTerminalInput'
    },
    'terminal.RESIZE_TERMINAL': {
      actions: 'resizeTerminal'
    },
    'terminal.RENAME_TERMINAL': {
      actions: 'renameTerminal'
    },
    'terminal.UPDATE_BASE_DIRECTORY': {
      actions: 'updateBaseDirectory'
    }
  },
  states: {
    initializing: {
      invoke: {
        src: 'restoreTerminalsActor',
        onDone: {
          target: 'idle',
          actions: 'sendConnectedData'
        }
      }
    },
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
        'terminal.REFRESH_LIST': {
          actions: 'listTerminals'
        },
        'terminal.OPEN_TERMINAL_TAB': {
          actions: 'openTerminalTab'
        }
      }
    }
  }
})