import { setup, assign, enqueueActions } from 'xstate';
import { trpc } from '@/core/trpc';
import { terminalEventBus } from '../../utils/terminal-events';
import { updateParentState, getParentContext, addTabToParent } from '../../utils/parent-communication';
import { removeTabs, nextActiveFromHistory } from '../../utils/tab-management';

export interface TerminalInfo {
  id: string
  title: string
  customTitle?: string
  pid: number
  shell?: string
  cwd: string
  active: boolean
  cols: number
  rows: number
}

const sendToBackend = (type: string, data: any) => {
  trpc.bus.send.mutate({
    systemId: 'code' as any,
    type: type as any,
    ...data
  } as any)
}

export interface Context {
  terminals: TerminalInfo[]
  terminalError: string | null
}

export type Event =
  | { type: 'terminal.CREATE'; title?: string; cwd?: string }
  | { type: 'terminal.CLOSE'; terminalId: string }
  | { type: 'terminal.INPUT'; terminalId: string; data: string }
  | { type: 'terminal.RESIZE'; terminalId: string; cols: number; rows: number }
  | { type: 'terminal.RENAME'; terminalId: string; customTitle: string }
  | { type: 'terminal.REFRESH_LIST' }
  | { type: 'terminal.OPEN_TAB'; terminalInfo: TerminalInfo }
  | { type: 'terminal.OPEN_TABS'; terminalIds: string[] }
  | { type: 'terminal.TERMINALS_LISTED'; data: TerminalInfo[] }
  | { type: 'terminal.CREATED'; data: TerminalInfo }
  | { type: 'terminal.CLOSED'; data: { terminalId: string } }
  | { type: 'terminal.RENAMED'; data: { terminalId: string; customTitle: string } }
  | { type: 'terminal.CWD_CHANGED'; data: { terminalId: string; cwd: string; title?: string } }
  | { type: 'terminal.OUTPUT'; data: { terminalId: string; data: string } }
  | { type: 'terminal.ERROR'; data: { message: string; terminalId?: string } }
  | { type: 'terminal.TERMINAL_TAB_OPENED'; data: TerminalInfo }
  | { type: 'terminal.CLEAR_ERROR' }
  | { type: 'CODE_STARTUP'; data: { terminals?: TerminalInfo[] } };  // Broadcasted event

export const terminalState = setup({
  types: {
    context: {} as Context,
    events: {} as Event
  },
  actions: {
    createTerminal: ({ event, self }) => {
      const ev = event as { type: 'terminal.CREATE'; title?: string; cwd?: string }
      const parentContext = getParentContext(self)
      const baseDir = parentContext?.baseDirectory

      sendToBackend('terminal.CREATE_TERMINAL', {
        title: ev.title,
        cwd: ev.cwd || (baseDir && baseDir.trim() ? baseDir : undefined)
      })
    },

    closeTerminal: ({ event }) => {
      const ev = event as { type: 'terminal.CLOSE'; terminalId: string }
      sendToBackend('terminal.CLOSE_TERMINAL', { terminalId: ev.terminalId })
    },

    sendTerminalInput: ({ event }) => {
      const ev = event as { type: 'terminal.INPUT'; terminalId: string; data: string }
      sendToBackend('terminal.TERMINAL_INPUT', { terminalId: ev.terminalId, data: ev.data })
    },

    resizeTerminal: ({ event }) => {
      const ev = event as { type: 'terminal.RESIZE'; terminalId: string; cols: number; rows: number }
      sendToBackend('terminal.RESIZE_TERMINAL', {
        terminalId: ev.terminalId,
        cols: ev.cols,
        rows: ev.rows
      })
    },

    renameTerminal: ({ event }) => {
      const ev = event as { type: 'terminal.RENAME'; terminalId: string; customTitle: string }
      sendToBackend('terminal.RENAME_TERMINAL', {
        terminalId: ev.terminalId,
        customTitle: ev.customTitle
      })
    },

    listTerminals: () => {
      sendToBackend('terminal.REFRESH_LIST', {})
    },

    assignTerminals: assign({
      terminals: ({ event }) => {
        const ev = event as { type: 'terminal.TERMINALS_LISTED'; data: TerminalInfo[] }
        return ev.data || []
      }
    }),

    assignTerminalCreated: assign({
      terminals: ({ context, event }) => {
        const ev = event as { type: 'terminal.CREATED'; data: TerminalInfo }
        return [...context.terminals, ev.data]
      }
    }),

    removeTerminal: assign({
      terminals: ({ context, event }) => {
        const ev = event as { type: 'terminal.CLOSED'; data: { terminalId: string } }
        return context.terminals.filter(t => t.id !== ev.data.terminalId)
      }
    }),

    updateTerminalTitle: enqueueActions(({ enqueue, context, event, self }) => {
      const ev = event as { type: 'terminal.RENAMED'; data: { terminalId: string; customTitle: string } }

      // Update local terminals list
      enqueue.assign({
        terminals: context.terminals.map(t =>
          t.id === ev.data.terminalId
            ? { ...t, customTitle: ev.data.customTitle }
            : t
        )
      })

      // Propagate to parent's openFiles so tab label updates
      enqueue(() => {
        const parentContext = getParentContext(self)
        const openFiles = parentContext?.openFiles || []
        const terminalPath = `terminal:${ev.data.terminalId}`

        const updatedOpenFiles = openFiles.map((file: any) => {
          if (file.path === terminalPath && file.isTerminal) {
            return {
              ...file,
              terminalInfo: {
                ...file.terminalInfo,
                customTitle: ev.data.customTitle
              }
            }
          }
          return file
        })

        updateParentState(self, { openFiles: updatedOpenFiles })
      })
    }),

    updateTerminalCwd: enqueueActions(({ enqueue, context, event, self }) => {
      const ev = event as { type: 'terminal.CWD_CHANGED'; data: { terminalId: string; cwd: string; title?: string } }

      // Update terminal info in context
      enqueue(assign({
        terminals: context.terminals.map(t => {
          if (t.id === ev.data.terminalId) {
            const updated = { ...t, cwd: ev.data.cwd }
            // Update title if provided (when no customTitle is set)
            if (ev.data.title) {
              updated.title = ev.data.title
            }
            return updated
          }
          return t
        })
      }))

      // Update parent state to refresh tab label
      enqueue(() => {
        const parentContext = getParentContext(self)
        const terminalPath = `terminal:${ev.data.terminalId}`

        // Find and update the terminal tab in openFiles
        const updatedOpenFiles = (parentContext?.openFiles || []).map((file: any) => {
          if (file.path === terminalPath && file.isTerminal) {
            const terminal = context.terminals.find(t => t.id === ev.data.terminalId)
            if (terminal) {
              return {
                ...file,
                terminalInfo: {
                  ...file.terminalInfo,
                  cwd: ev.data.cwd,
                  title: ev.data.title || file.terminalInfo.title
                }
              }
            }
          }
          return file
        })

        updateParentState(self, {
          openFiles: updatedOpenFiles
        })
      })
    }),

    clearTerminalError: assign({
      terminalError: null
    }),

    assignTerminalError: assign({
      terminalError: ({ event }) => {
        const ev = event as { type: 'terminal.ERROR'; data: { message: string; terminalId?: string } }
        return ev.data.message
      }
    }),

    cleanupTerminalOutput: ({ event }) => {
      const ev = event as { type: 'terminal.CLOSED'; data: { terminalId: string } }
      terminalEventBus.clearOutput(ev.data.terminalId)
    },

    handleTerminalOutput: ({ event }) => {
      const ev = event as { type: 'terminal.OUTPUT'; data: { terminalId: string; data: string } }
      terminalEventBus.emit(ev.data.terminalId, ev.data.data)
    },

    handleTerminalCreated: enqueueActions(({ enqueue, self, event }) => {
      enqueue('assignTerminalCreated')
      enqueue(() => {
        const ev = event as { type: 'terminal.CREATED'; data: TerminalInfo }
        const terminalInfo = ev.data

        // Create terminal tab object
        const terminalTab = {
          path: `terminal:${terminalInfo.id}`,
          content: '',
          modified: false,
          isTerminal: true,
          terminalInfo: terminalInfo
        }

        addTabToParent(self, terminalTab)
      })
    }),

    handleTerminalClosed: enqueueActions(({ enqueue, self, event }) => {
      enqueue('removeTerminal')
      enqueue('cleanupTerminalOutput')
      enqueue(() => {
        const ev = event as { type: 'terminal.CLOSED'; data: { terminalId: string } }
        const terminalId = ev.data.terminalId

        const parentContext = getParentContext(self)
        const terminalPath = `terminal:${terminalId}`

        const result = removeTabs(
          parentContext?.openFiles || [],
          terminalPath,
          parentContext?.activeFilePath
        )

        // Use history-based fallback if closing the active terminal
        if (parentContext?.activeFilePath === terminalPath && result.openFiles.length > 0) {
          result.activeFilePath = nextActiveFromHistory(parentContext?.tabViewHistory || [], result.openFiles)
        }

        updateParentState(self, result)
      })
    }),

    handleCodeStartup: ({ event, self }) => {
      const ev = event as { type: 'CODE_STARTUP'; data: { terminals?: TerminalInfo[] } }
      // If startup includes terminals, handle them like TERMINALS_LISTED
      if (ev.data?.terminals) {
        self.send({
          type: 'terminal.TERMINALS_LISTED',
          data: ev.data.terminals
        })
      }
    },

    openTerminalTab: ({ event, self }) => {
      const ev = event as { type: 'terminal.OPEN_TAB'; terminalInfo: TerminalInfo }
      const parentContext = getParentContext(self)
      const openFiles = parentContext?.openFiles || []
      const terminalPath = `terminal:${ev.terminalInfo.id}`

      // Check if terminal tab already exists
      const existingTab = openFiles.find((f: any) => f.path === terminalPath)

      if (existingTab) {
        // Tab already exists, just activate it
        updateParentState(self, {
          activeFilePath: terminalPath
        })
      } else {
        // Create terminal tab object
        const terminalTab = {
          path: terminalPath,
          content: '',
          modified: false,
          isTerminal: true,
          terminalInfo: ev.terminalInfo
        }

        addTabToParent(self, terminalTab)
      }
    },

    openTerminalTabs: ({ event }) => {
      const ev = event as { type: 'terminal.OPEN_TABS'; terminalIds: string[] }
      // Send individual requests to backend for each terminal
      ev.terminalIds.forEach(terminalId => {
        sendToBackend('terminal.OPEN_TERMINAL_TAB', { terminalId })
      })
    },

    handleTerminalTabOpened: ({ event, self }) => {
      const ev = event as { type: 'terminal.TERMINAL_TAB_OPENED'; data: TerminalInfo }
      const parentContext = getParentContext(self)
      const openFiles = parentContext?.openFiles || []
      const terminalPath = `terminal:${ev.data.id}`

      // Check if terminal tab already exists
      const existingTab = openFiles.find((f: any) => f.path === terminalPath)

      if (existingTab) {
        // Tab already exists, don't create duplicate
        // For restored tabs, we might not want to change active tab
        return
      }

      // Create terminal tab but keep current active tab
      const terminalTab = {
        path: terminalPath,
        content: '',
        modified: false,
        isTerminal: true,
        terminalInfo: ev.data
      }
      addTabToParent(self, terminalTab, false, {
        activeFilePath: parentContext?.activeFilePath
      })
    }
  }
}).createMachine({
  id: 'terminal',
  initial: 'idle',
  context: {
    terminals: [],
    terminalError: null
  },
  on: {
    'terminal.CREATE': {
      actions: ['clearTerminalError', 'createTerminal']
    },
    'terminal.CLOSE': {
      actions: 'closeTerminal'
    },
    'terminal.INPUT': {
      actions: 'sendTerminalInput'
    },
    'terminal.RESIZE': {
      actions: 'resizeTerminal'
    },
    'terminal.RENAME': {
      actions: 'renameTerminal'
    },
    'terminal.REFRESH_LIST': {
      actions: 'listTerminals'
    },
    'terminal.OPEN_TAB': {
      actions: 'openTerminalTab'
    },
    'terminal.OPEN_TABS': {
      actions: 'openTerminalTabs'
    },
    'terminal.TERMINALS_LISTED': {
      actions: ['clearTerminalError', 'assignTerminals']
    },
    'terminal.CREATED': {
      actions: ['clearTerminalError', 'handleTerminalCreated']
    },
    'terminal.CLOSED': {
      actions: 'handleTerminalClosed'
    },
    'terminal.RENAMED': {
      actions: 'updateTerminalTitle'
    },
    'terminal.CWD_CHANGED': {
      actions: 'updateTerminalCwd'
    },
    'terminal.OUTPUT': {
      actions: 'handleTerminalOutput'
    },
    'terminal.ERROR': {
      actions: ['assignTerminalError', ({ self }) => {
        // Clear error after 5 seconds
        setTimeout(() => {
          self.send({ type: 'terminal.CLEAR_ERROR' })
        }, 4000)
      }]
    },
    'terminal.CLEAR_ERROR': {
      actions: 'clearTerminalError'
    },
    'terminal.TERMINAL_TAB_OPENED': {
      actions: 'handleTerminalTabOpened'
    },
    'CODE_STARTUP': {
      actions: 'handleCodeStartup'
    }
  },
  states: {
    idle: {
    }
  }
});
