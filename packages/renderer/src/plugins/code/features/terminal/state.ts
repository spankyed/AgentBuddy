import { setup, assign, enqueueActions } from 'xstate';
import { trpc } from '@/core/trpc';
import { terminalEventBus } from '../../utils/terminal-events';
import { terminalPool } from '../../utils/terminal-pool';
import { updateParentState, getParentContext, addTabToParent, sendEventToParent } from '../../utils/parent-communication';
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

const createTerminalTab = (info: TerminalInfo) => ({
  path: `terminal:${info.id}`,
  content: '',
  modified: false,
  isTerminal: true,
  terminalInfo: info
})

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
  pendingTarget: 'tab' | null  // When 'tab', next created terminal routes to canvas tab instead of panel
  pendingCommand: string | null  // Command to run in terminal after creation
}

export type Event =
  | { type: 'terminal.CREATE'; title?: string; cwd?: string; target?: 'tab'; command?: string }
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
  | { type: 'CODE_STARTUP'; data: { terminals?: TerminalInfo[] } };  // Broadcasted event

export const terminalState = setup({
  types: {
    context: {} as Context,
    events: {} as Event
  },
  actions: {
    createTerminal: assign(({ event, self }) => {
      const ev = event as { type: 'terminal.CREATE'; title?: string; cwd?: string; target?: 'tab'; command?: string }
      const parentContext = getParentContext(self)
      const baseDir = parentContext?.baseDirectory

      sendToBackend('terminal.CREATE_TERMINAL', {
        title: ev.title,
        cwd: ev.cwd || (baseDir && baseDir.trim() ? baseDir : undefined)
      })

      return { pendingTarget: ev.target ?? null, pendingCommand: ev.command ?? null }
    }),

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

    assignTerminals: enqueueActions(({ enqueue, self, event }) => {
      const ev = event as { type: 'terminal.TERMINALS_LISTED'; data: TerminalInfo[] }
      const terminals = ev.data || []
      enqueue(assign({ terminals }))

      enqueue(() => {
        terminalEventBus.prunePersistedOutputs(terminals.map(t => t.id))

        const parentContext = getParentContext(self)
        const pendingTabIds: string[] | undefined = parentContext?.pendingTerminalTabIds

        const updates: Partial<{ panelTerminalId: string | null; pendingTerminalTabIds: undefined; pendingTabOrder: Array<{ path: string; order: number }> | undefined }> = {}

        // Restore deferred terminal tabs
        if (pendingTabIds && pendingTabIds.length > 0 && terminals.length > 0) {
          const restoredIds: string[] = []
          const staleTabPaths: string[] = []

          for (const terminalId of pendingTabIds) {
            const info = terminals.find(t => t.id === terminalId)
            if (info) {
              addTabToParent(self, createTerminalTab(info), false, {
                activeFilePath: parentContext?.activeFilePath
              })
              restoredIds.push(terminalId)
            } else {
              // Terminal no longer exists on backend — mark for cleanup
              staleTabPaths.push(`terminal:${terminalId}`)
            }
          }

          // Clean stale terminal paths from pendingTabOrder so restoration can complete
          if (staleTabPaths.length > 0 && parentContext?.pendingTabOrder) {
            const filtered = parentContext.pendingTabOrder.filter(
              (t: any) => !staleTabPaths.includes(t.path)
            )
            updates.pendingTabOrder = filtered.length > 0 ? filtered : undefined
          }

          updates.pendingTerminalTabIds = undefined
        }

        // Auto-select panel terminal if none selected or persisted ID is stale
        const currentPanelId = parentContext?.panelTerminalId
        const panelTerminalExists = currentPanelId && terminals.some(t => t.id === currentPanelId)

        if ((!currentPanelId || !panelTerminalExists) && terminals.length > 0) {
          const tabbedIds = new Set(
            (parentContext?.openFiles || []).filter((f: any) => f.isTerminal).map((f: any) => f.terminalInfo.id)
          )
          if (pendingTabIds) {
            for (const id of pendingTabIds) tabbedIds.add(id)
          }
          const available = terminals.find(t => !tabbedIds.has(t.id))
          if (available) {
            updates.panelTerminalId = available.id
          } else if (!panelTerminalExists) {
            updates.panelTerminalId = null
          }
        }

        if (Object.keys(updates).length > 0) {
          updateParentState(self, updates)
        }
      })
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

      // Tell parent to surgically update the matching terminal tab.
      // Avoids sending a full openFiles snapshot which can race with pending ADD_TAB events.
      enqueue(() => {
        sendEventToParent(self, {
          type: 'TERMINAL_TAB_INFO_CHANGED',
          terminalId: ev.data.terminalId,
          changes: { customTitle: ev.data.customTitle }
        })
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

      // Tell parent to surgically update the matching terminal tab.
      // Avoids sending a full openFiles snapshot which can race with pending ADD_TAB events.
      enqueue(() => {
        sendEventToParent(self, {
          type: 'TERMINAL_TAB_INFO_CHANGED',
          terminalId: ev.data.terminalId,
          changes: { cwd: ev.data.cwd, title: ev.data.title }
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
      terminalPool.dispose(ev.data.terminalId)
    },

    handleTerminalOutput: ({ event }) => {
      const ev = event as { type: 'terminal.OUTPUT'; data: { terminalId: string; data: string } }
      terminalEventBus.emit(ev.data.terminalId, ev.data.data)
    },

    handleTerminalCreated: enqueueActions(({ enqueue, context, self, event }) => {
      enqueue('assignTerminalCreated')
      const target = context.pendingTarget
      const command = context.pendingCommand
      enqueue(assign({ pendingTarget: null, pendingCommand: null }))
      enqueue(() => {
        const ev = event as { type: 'terminal.CREATED'; data: TerminalInfo }
        const terminalInfo = ev.data

        if (target === 'tab') {
          // Explicit tab target — create canvas tab
          addTabToParent(self, createTerminalTab(terminalInfo))
        } else {
          // Default — route to panel
          updateParentState(self, { panelTerminalId: terminalInfo.id })
        }

        // Run pending command if set
        if (command) {
          sendToBackend('terminal.TERMINAL_INPUT', {
            terminalId: terminalInfo.id,
            data: command + '\n'
          })
        }
      })
    }),

    handleTerminalClosed: enqueueActions(({ enqueue, context, self, event }) => {
      enqueue('removeTerminal')
      enqueue('cleanupTerminalOutput')
      enqueue(() => {
        const ev = event as { type: 'terminal.CLOSED'; data: { terminalId: string } }
        const terminalId = ev.data.terminalId
        const parentContext = getParentContext(self)
        const terminalPath = `terminal:${terminalId}`

        // Remove canvas tab if present
        const result = removeTabs(
          parentContext?.openFiles || [],
          terminalPath,
          parentContext?.activeFilePath
        )
        if (parentContext?.activeFilePath === terminalPath && result.openFiles.length > 0) {
          result.activeFilePath = nextActiveFromHistory(parentContext?.tabViewHistory || [], result.openFiles)
        }

        // If this was the panel terminal, auto-select next available
        let panelUpdate: { panelTerminalId: string | null } | undefined
        if (parentContext?.panelTerminalId === terminalId) {
          const tabbedIds = new Set(
            (result.openFiles || []).filter((f: any) => f.isTerminal).map((f: any) => f.terminalInfo.id)
          )
          const next = context.terminals.find(t => !tabbedIds.has(t.id))
          panelUpdate = { panelTerminalId: next?.id ?? null }
        }

        updateParentState(self, { ...result, ...panelUpdate })
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
        addTabToParent(self, createTerminalTab(ev.terminalInfo))
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
      addTabToParent(self, createTerminalTab(ev.data), false, {
        activeFilePath: parentContext?.activeFilePath
      })
    }
  }
}).createMachine({
  id: 'terminal',
  initial: 'idle',
  context: {
    terminals: [],
    terminalError: null,
    pendingTarget: null,
    pendingCommand: null
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
      actions: 'assignTerminalError'
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
