import { setup, assign, enqueueActions } from 'xstate';
import { trpc } from '@/core/trpc';
import type { TerminalInfo } from '../../state';
import { terminalEventBus } from '../../utils/terminal-events';
import { updateParentState, getParentContext } from '../../utils/parent-communication';
import { mergeTabs, removeTabs } from '../../utils/tab-management';

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
  | { type: 'terminal.TERMINALS_LISTED'; data: TerminalInfo[] }  // Backend format
  | { type: 'terminal.CREATED'; terminalInfo: TerminalInfo }
  | { type: 'terminal.CREATED'; data: TerminalInfo }  // Backend format
  | { type: 'terminal.CLOSED'; terminalId: string }
  | { type: 'terminal.CLOSED'; data: { terminalId: string } }  // Backend format
  | { type: 'terminal.OUTPUT'; terminalId: string; data: string }
  | { type: 'terminal.OUTPUT'; data: { terminalId: string; data: string } }  // Backend format
  | { type: 'terminal.ERROR'; message: string; terminalId?: string }
  | { type: 'terminal.ERROR'; data: { message: string; terminalId?: string } }
  | { type: 'CODE_STARTUP'; data: { terminals?: TerminalInfo[] } };  // Broadcast event

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
        // Handle both formats
        const terminalInfo = 'data' in event 
          ? (event as { type: 'terminal.CREATED'; data: TerminalInfo }).data
          : (event as { type: 'terminal.CREATED'; terminalInfo: TerminalInfo }).terminalInfo
        return [...context.terminals, terminalInfo]
      }
    }),
    
    removeTerminal: assign({
      terminals: ({ context, event }) => {
        // Handle both formats
        const terminalId = 'data' in event
          ? (event as { type: 'terminal.CLOSED'; data: { terminalId: string } }).data.terminalId
          : (event as { type: 'terminal.CLOSED'; terminalId: string }).terminalId
        return context.terminals.filter(t => t.id !== terminalId)
      }
    }),
    
    assignTerminalError: assign({
      terminalError: ({ event }) => {
        // Handle both formats
        const message = 'data' in event
          ? (event as { type: 'terminal.ERROR'; data: { message: string; terminalId?: string } }).data.message
          : (event as { type: 'terminal.ERROR'; message: string; terminalId?: string }).message
        return message
      }
    }),
    
    cleanupTerminalOutput: ({ event }) => {
      // Handle both formats
      const terminalId = 'data' in event
        ? (event as { type: 'terminal.CLOSED'; data: { terminalId: string } }).data.terminalId
        : (event as { type: 'terminal.CLOSED'; terminalId: string }).terminalId
      terminalEventBus.clearOutput(terminalId)
    },
    
    handleTerminalOutput: ({ event }) => {
      // Handle both formats
      if ('data' in event && typeof event.data === 'object') {
        // Backend format: { type: 'terminal.OUTPUT'; data: { terminalId: string; data: string } }
        const { terminalId, data } = (event as { type: 'terminal.OUTPUT'; data: { terminalId: string; data: string } }).data
        terminalEventBus.emit(terminalId, data)
      } else {
        // Frontend format: { type: 'terminal.OUTPUT'; terminalId: string; data: string }
        const ev = event as { type: 'terminal.OUTPUT'; terminalId: string; data: string }
        terminalEventBus.emit(ev.terminalId, ev.data)
      }
    },
    
    handleTerminalCreated: enqueueActions(({ enqueue, self, event }) => {
      enqueue('assignTerminalCreated')
      enqueue(() => {
        // Handle both formats
        const terminalInfo = 'data' in event 
          ? (event as { type: 'terminal.CREATED'; data: TerminalInfo }).data
          : (event as { type: 'terminal.CREATED'; terminalInfo: TerminalInfo }).terminalInfo
        
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
        // Handle both formats
        const terminalId = 'data' in event
          ? (event as { type: 'terminal.CLOSED'; data: { terminalId: string } }).data.terminalId
          : (event as { type: 'terminal.CLOSED'; terminalId: string }).terminalId
        
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
    
    openTerminalTabs: ({ event, self, context }) => {
      const ev = event as { type: 'terminal.OPEN_TABS'; terminalIds: string[] }
      const parentContext = getParentContext(self)
      
      // Find terminals by ID and create tab objects
      const terminalTabs = ev.terminalIds
        .map(terminalId => context.terminals.find(t => t.id === terminalId))
        .filter((terminal): terminal is TerminalInfo => terminal !== undefined)
        .map(terminal => ({
          path: `terminal:${terminal.id}`,
          content: '',
          modified: false,
          isTerminal: true,
          terminalInfo: terminal
        }))
      
      const result = mergeTabs(
        parentContext?.openFiles || [],
        terminalTabs,
        parentContext?.activeFilePath // Keep current active or use first new terminal
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
  states: {
    idle: {
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
        'CODE_STARTUP': {
          actions: 'handleCodeStartup'
        }
      }
    }
  }
});