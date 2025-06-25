import { setup, type ActorRefFrom, assign } from 'xstate';
import { safeEvents } from '@/core/types/safe-events';

export const id = 'logs' as const;

export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  source?: string;
  meta?: Record<string, any>;
  stack?: string;
}

export interface LogsContext {
  logs: LogEntry[];
  filter: {
    level: 'all' | 'debug' | 'info' | 'warn' | 'error';
    search: string;
  };
  autoScroll: boolean;
}

type LogsEvents =
  | { type: 'logs:LOGS_UPDATE'; logs: LogEntry[] }
  | { type: 'logs:LOG_ADDED'; log: LogEntry }
  | { type: 'logs:LOGS_CLEARED' }
  | { type: 'SET_FILTER_LEVEL'; level: 'all' | 'debug' | 'info' | 'warn' | 'error' }
  | { type: 'SET_SEARCH'; search: string }
  | { type: 'TOGGLE_AUTO_SCROLL' }
  | { type: 'CLEAR_LOGS' };

const typeOf = safeEvents<LogsEvents>();

export type LogsState = ActorRefFrom<typeof logsState>;

const logsState = setup({
  types: {
    context: {} as LogsContext,
    events: {} as LogsEvents,
  },
  actions: {
    updateLogs: assign({
      logs: ({ event }) => typeOf('logs:LOGS_UPDATE', event).logs,
    }),
    addLog: assign({
      logs: ({ context, event }) => [...context.logs, typeOf('logs:LOG_ADDED', event).log],
    }),
    clearLogs: assign({
      logs: () => [],
    }),
    setFilterLevel: assign({
      filter: ({ context, event }) => ({
        ...context.filter,
        level: typeOf('SET_FILTER_LEVEL', event).level,
      }),
    }),
    setSearch: assign({
      filter: ({ context, event }) => ({
        ...context.filter,
        search: typeOf('SET_SEARCH', event).search,
      }),
    }),
    toggleAutoScroll: assign({
      autoScroll: ({ context }) => !context.autoScroll,
    }),

  },
}).createMachine({
  id,
  initial: 'active',
  context: {
    logs: [],
    filter: {
      level: 'all',
      search: '',
    },
    autoScroll: true,
  },
  states: {
    active: {
      on: {
        'logs:LOGS_UPDATE': {
          actions: 'updateLogs',
        },
        'logs:LOG_ADDED': {
          actions: 'addLog',
        },
        'logs:LOGS_CLEARED': {
          actions: 'clearLogs',
        },
        SET_FILTER_LEVEL: {
          actions: 'setFilterLevel',
        },
        SET_SEARCH: {
          actions: 'setSearch',
        },
        TOGGLE_AUTO_SCROLL: {
          actions: 'toggleAutoScroll',
        },
        CLEAR_LOGS: {
          actions: 'clearLogs',
        },
      },
    },
  },
}); 

export default logsState; 