import { setup, assign, enqueueActions } from 'xstate';
import { trpc } from '@/core/trpc';
import { terminalEventBus } from '../../utils/terminal-events';
import { updateParentState, getParentContext } from '../../utils/parent-communication';
import { mergeTabs, removeTabs } from '../../utils/tab-management';

export interface TerminalInfo {
  id: string
  title: string
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
  | { type: 'terminal.REFRESH_LIST' }
  | { type: 'terminal.OPEN_TAB'; terminalInfo: TerminalInfo }
  | { type: 'terminal.OPEN_TABS'; terminalIds: string[] }
  | { type: 'terminal.TERMINALS_LISTED'; data: TerminalInfo[] }
  | { type: 'terminal.CREATED'; data: TerminalInfo }
  | { type: 'terminal.CLOSED'; data: { terminalId: string } }
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
    createTerminal: ({ event, self }) => {
      const ev = event as { type: 'terminal.CREATE'; title?: string; cwd?: string }
      const parentContext = getParentContext(self)
      
      sendToBackend('terminal.CREATE_TERMINAL', {
        title: ev.title,
        cwd: ev.cwd || parentContext?.currentDirectory
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
        
        const parentContext = getParentContext(self)
        
        // Create terminal tab object
        const terminalTab = {
          path: `terminal:${terminalInfo.id}`,
          content: '',
          modified: false,
          isTerminal: true,
          terminalInfo: terminalInfo
        }
        
        const result = mergeTabs(
          parentContext?.openFiles || [],
          [terminalTab],
          terminalTab.path // Always set new terminal as active
        )
        
        updateParentState(self, result)
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
      
      // Create terminal tab object
      const terminalTab = {
        path: `terminal:${ev.terminalInfo.id}`,
        content: '',
        modified: false,
        isTerminal: true,
        terminalInfo: ev.terminalInfo
      }
      
      const result = mergeTabs(
        parentContext?.openFiles || [],
        [terminalTab],
        terminalTab.path // Always set this terminal as active
      )
      
      updateParentState(self, result)
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
      
      // Create terminal tab object
      const terminalTab = {
        path: `terminal:${ev.data.id}`,
        content: '',
        modified: false,
        isTerminal: true,
        terminalInfo: ev.data
      }
      
      const result = mergeTabs(
        parentContext?.openFiles || [],
        [terminalTab],
        parentContext?.activeFilePath // Keep current active
      )
      
      updateParentState(self, result)
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
      actions: 'createTerminal'
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
      actions: 'assignTerminals'
    },
    'terminal.CREATED': {
      actions: 'handleTerminalCreated'
    },
    'terminal.CLOSED': {
      actions: 'handleTerminalClosed'
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