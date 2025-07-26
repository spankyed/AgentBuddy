import { setup, assign } from 'xstate';
import { trpc } from '@/core/trpc';
import type { TerminalInfo } from '../../state';
import { terminalEventBus } from '../../utils/terminal-events';
import { updateParentState, getParentContext } from '../../utils/parent-communication';

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
  | { type: 'terminal.LIST' }
  | { type: 'terminal.TERMINALS_LISTED'; terminals: TerminalInfo[] }
  | { type: 'terminal.CREATED'; terminalInfo: TerminalInfo }
  | { type: 'terminal.CREATED'; data: TerminalInfo }  // Backend format
  | { type: 'terminal.CLOSED'; terminalId: string }
  | { type: 'terminal.CLOSED'; data: { terminalId: string } }  // Backend format
  | { type: 'terminal.OUTPUT'; terminalId: string; data: string }
  | { type: 'terminal.OUTPUT'; data: { terminalId: string; data: string } }  // Backend format
  | { type: 'terminal.ERROR'; message: string; terminalId?: string }
  | { type: 'terminal.ERROR'; data: { message: string; terminalId?: string } };

export const terminalState = setup({
  types: {
    context: {} as Context,
    events: {} as Event
  },
  actions: {
    createTerminal: ({ event, self }) => {
      const ev = event as { type: 'terminal.CREATE'; title?: string; cwd?: string }
      const parentContext = self._parent?.getSnapshot()?.context as any
      
      sendToBackend('CREATE_TERMINAL', {
        title: ev.title,
        cwd: ev.cwd || parentContext?.currentDirectory
      })
    },
    
    closeTerminal: ({ event }) => {
      const ev = event as { type: 'terminal.CLOSE'; terminalId: string }
      sendToBackend('CLOSE_TERMINAL', { terminalId: ev.terminalId })
    },
    
    sendTerminalInput: ({ event }) => {
      const ev = event as { type: 'terminal.INPUT'; terminalId: string; data: string }
      sendToBackend('TERMINAL_INPUT', { terminalId: ev.terminalId, data: ev.data })
    },
    
    resizeTerminal: ({ event }) => {
      const ev = event as { type: 'terminal.RESIZE'; terminalId: string; cols: number; rows: number }
      sendToBackend('RESIZE_TERMINAL', { 
        terminalId: ev.terminalId, 
        cols: ev.cols, 
        rows: ev.rows 
      })
    },
    
    listTerminals: () => {
      sendToBackend('LIST_TERMINALS', {})
    },
    
    assignTerminals: assign({
      terminals: ({ event }) => {
        const ev = event as { type: 'terminal.TERMINALS_LISTED'; terminals: TerminalInfo[] }
        return ev.terminals
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
        'terminal.LIST': {
          actions: 'listTerminals'
        },
        'terminal.TERMINALS_LISTED': {
          actions: 'assignTerminals'
        },
        'terminal.CREATED': {
          actions: ['assignTerminalCreated', ({ self, event }) => {
            // Handle both formats
            const terminalInfo = 'data' in event 
              ? (event as { type: 'terminal.CREATED'; data: TerminalInfo }).data
              : (event as { type: 'terminal.CREATED'; terminalInfo: TerminalInfo }).terminalInfo
            
            const parentContext = getParentContext(self)
            const terminalPath = `terminal:${terminalInfo.id}`
            
            // Build new openFiles array
            const openFiles = parentContext?.openFiles || []
            const existingTab = openFiles.find((f: any) => f.path === terminalPath)
            
            let newOpenFiles
            if (existingTab) {
              // Update existing tab
              newOpenFiles = openFiles.map((f: any) => 
                f.path === terminalPath && f.isTerminal
                  ? { ...f, terminalInfo }
                  : f
              )
            } else {
              // Add new terminal tab
              const terminalTab = {
                path: terminalPath,
                content: '',
                modified: false,
                isTerminal: true,
                terminalInfo
              }
              newOpenFiles = [...openFiles, terminalTab]
            }
            
            // Send updated state to parent
            updateParentState(self, {
              openFiles: newOpenFiles,
              activeFilePath: terminalPath
            });
          }]
        },
        'terminal.CLOSED': {
          actions: ['removeTerminal', 'cleanupTerminalOutput', ({ self, event }) => {
            // Handle both formats
            const terminalId = 'data' in event
              ? (event as { type: 'terminal.CLOSED'; data: { terminalId: string } }).data.terminalId
              : (event as { type: 'terminal.CLOSED'; terminalId: string }).terminalId
              
            const parentContext = getParentContext(self)
            const terminalPath = `terminal:${terminalId}`
            
            // Remove terminal tab from openFiles
            const openFiles = parentContext?.openFiles || []
            const newOpenFiles = openFiles.filter((f: any) => f.path !== terminalPath)
            
            // Update parent state
            const updates: any = { openFiles: newOpenFiles }
            
            // If this was the active file, set a new active file
            if (parentContext?.activeFilePath === terminalPath) {
              updates.activeFilePath = newOpenFiles.length > 0 ? newOpenFiles[0].path : null
            }
            
            updateParentState(self, updates);
          }]
        },
        'terminal.OUTPUT': {
          actions: 'handleTerminalOutput'
        },
        'terminal.ERROR': {
          actions: 'assignTerminalError'
        }
      }
    }
  }
});