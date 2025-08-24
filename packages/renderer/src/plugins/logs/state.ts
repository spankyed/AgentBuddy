import { setup, type ActorRefFrom, assign, log } from 'xstate';
import { safeEvents } from '@/core/types/safe-events';
import { trpc } from '@/core/trpc';

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
  settings: {
    maxLogs: number;
    excludedSources: string[];
  };
}

type LogsEvents =
  | { type: 'LOGS_STARTUP'; logs: LogEntry[]; settings?: { maxLogs: number; excludedSources: string[] } }
  | { type: 'LOGS_REFRESH'; logs: LogEntry[] }
  | { type: 'LOGS_UPDATE'; logs: LogEntry[] }
  | { type: 'LOG_ADDED'; log: LogEntry }
  | { type: 'LOGS_CLEARED' }
  | { type: 'SET_FILTER_LEVEL'; level: 'all' | 'debug' | 'info' | 'warn' | 'error' }
  | { type: 'SET_SEARCH'; search: string }
  | { type: 'CLEAR_LOGS' }
  | { type: 'LOGS_SETTINGS_UPDATED'; settings: { maxLogs: number; excludedSources: string[] } };

const typeOf = safeEvents<LogsEvents>();

export type LogsState = ActorRefFrom<typeof logsState>;

const logsState = setup({
  types: {
    context: {} as LogsContext,
    events: {} as LogsEvents,
  },
  actions: {
    setStartupLogs: assign(({ event }) => {
      const ev = typeOf('LOGS_STARTUP', event);
      return {
        logs: ev.logs,
        settings: ev.settings ? ev.settings : undefined
      };
    }),
    updateLogs: assign({
      logs: ({ event }) => {
        if (event.type === 'LOGS_UPDATE') {
          return typeOf('LOGS_UPDATE', event).logs;
        }
        return typeOf('LOGS_REFRESH', event).logs;
      },
    }),
    addLog: assign({
      logs: ({ context, event }) => {
        const newLog = typeOf('LOG_ADDED', event).log;
        return context.logs.some(log => log.id === newLog.id) 
          ? context.logs 
          : [...context.logs, newLog];
      },
    }),
    clearLogs: assign({
      logs: () => [],
    }),
    sendClearLogsToBackend: () => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'CLEAR_LOGS',
      });
    },
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
    updateSettings: assign({
      settings: ({ event }) => typeOf('LOGS_SETTINGS_UPDATED', event).settings,
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
    settings: {
      maxLogs: 1000,
      excludedSources: [],
    },
  },
  states: {
    active: {
      on: {
        'LOGS_STARTUP': {
          actions: 'setStartupLogs',
        },
        'LOGS_REFRESH': {
          actions: 'updateLogs',
        },
        'LOGS_UPDATE': {
          actions: 'updateLogs',
        },
        'LOG_ADDED': {
          actions: 'addLog',
        },
        'LOGS_CLEARED': {
          actions: 'clearLogs',
        },
        SET_FILTER_LEVEL: {
          actions: 'setFilterLevel',
        },
        SET_SEARCH: {
          actions: 'setSearch',
        },
        CLEAR_LOGS: {
          actions: ['clearLogs', 'sendClearLogsToBackend'],
        },
        LOGS_SETTINGS_UPDATED: {
          actions: 'updateSettings',
        },
      },
    },
  },
}); 

export default logsState; 