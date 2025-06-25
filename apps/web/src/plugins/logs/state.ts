import { setup, type ActorRefFrom, assign, log } from 'xstate';
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
}

type LogsEvents =
  | { type: 'LOGS_STARTUP'; logs: LogEntry[] }
  | { type: 'LOGS_REFRESH'; logs: LogEntry[] }
  | { type: 'LOG_ADDED'; log: LogEntry }
  // | { type: 'LOGS_CLEARED' }
  | { type: 'SET_FILTER_LEVEL'; level: 'all' | 'debug' | 'info' | 'warn' | 'error' }
  | { type: 'SET_SEARCH'; search: string }
  | { type: 'CLEAR_LOGS' };

const typeOf = safeEvents<LogsEvents>();

export type LogsState = ActorRefFrom<typeof logsState>;

const logsState = setup({
  types: {
    context: {} as LogsContext,
    events: {} as LogsEvents,
  },
  actions: {
    setStartupLogs: assign({
      logs: ({ event }) => typeOf('LOGS_STARTUP', event).logs,
    }),
    updateLogs: assign({
      logs: ({ event }) => typeOf('LOGS_REFRESH', event).logs,
    }),
    addLog: assign({
      logs: ({ context, event }) => [...context.logs, typeOf('LOG_ADDED', event).log],
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
  },
  states: {
    active: {
      on: {
        'LOGS_STARTUP': {
          actions: [log('hiii'), 'setStartupLogs'],
        },
        'LOGS_REFRESH': {
          actions: 'updateLogs',
        },
        'LOG_ADDED': {
          actions: 'addLog',
        },
        // 'LOGS_CLEARED': {
        //   actions: 'clearLogs',
        // },
        SET_FILTER_LEVEL: {
          actions: 'setFilterLevel',
        },
        SET_SEARCH: {
          actions: 'setSearch',
        },
        CLEAR_LOGS: {
          actions: 'clearLogs',
        },
      },
    },
  },
}); 

export default logsState; 