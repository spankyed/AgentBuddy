import { assign, setup } from 'xstate';
import { fromSystem, systemBus, type MergeReceivable } from '@/shared/utils/event-helpers';
import { bus, SystemEvents } from '@/systems/_backend/backend';
import { emit } from '@/shared/utils/actor-helpers';
import type { EARS } from '@/shared/ears/types';
import type { LogsState, LogEntry } from './types';
import { z } from 'zod';
import { globalLogs, clearLogs, initializeMockLogs, setLogAddedCallback } from './logger';

export const logs = 'logs' as const;

const busEvent = systemBus(logs);

export const IncomingLogEvents = [
  busEvent('EMPTY', { empty: z.string() }),
  busEvent('CLEAR_LOGS', {}),
] as const

export type LogsInternalEvents = 
  | SystemEvents
  | { type: 'REQUEST_LOGS_UPDATE' }
  | { type: 'NEW_LOG_ADDED'; log: LogEntry }

type ReceivableEvents = MergeReceivable<typeof IncomingLogEvents, LogsInternalEvents>;

export type OutgoingLogsEvents =
  | { type: 'LOGS_STARTUP'; logs: LogEntry[] }
  | { type: 'LOGS_UPDATE'; logs: typeof globalLogs }
  | { type: 'LOG_ADDED'; log: LogEntry }
  | { type: 'LOGS_CLEARED' };

export interface LogsContext {
  systemId: EARS.EntityId;
}

export const LogsSystemEvents = fromSystem(IncomingLogEvents)<OutgoingLogsEvents, typeof logs>();

export const logsSystem = setup({
  types: {
    input: {} as EARS.EntityId,
    context: {} as LogsContext,
    events: {} as ReceivableEvents,
  },
  actions: {
    initializeLogs: ({ self }) => {
      // Set up the callback to receive new logs
      setLogAddedCallback((log: LogEntry) => {
        self.send({ type: 'NEW_LOG_ADDED', log });
      });
      // initializeMockLogs();
    },
    sendLogsStartup: ({ system }) => {
      system.get(bus).send(emit(logs, {
        type: 'LOGS_STARTUP',
        logs: globalLogs,
      }));
    },
    broadcastNewLog: ({ system, event }) => {
      const { log } = event as { type: 'NEW_LOG_ADDED'; log: LogEntry };
      system.get(bus).send(emit(logs, {
        type: 'LOG_ADDED',
        log,
      }));
    },
    clearLogsAction: () => {
      clearLogs();
    },
    broadcastLogsUpdate: ({ system }) => {
      system.get(bus).send(emit(logs, {
        type: 'LOGS_UPDATE',
        logs: globalLogs,
      }));
    },
    broadcastLogsCleared: ({ system }) => {
      system.get(bus).send(emit(logs, {
        type: 'LOGS_CLEARED',
      }));
    },
  },
}).createMachine({
  id: logs,
  initial: 'active',
  context: ({ input }) => ({
    systemId: input,
  }),
  entry: 'initializeLogs',
  on: {
    CLIENT_CONNECTED: {
      actions: ['sendLogsStartup'],
    },
  },
  states: {
    active: {
      on: {
        NEW_LOG_ADDED: {
          actions: 'broadcastNewLog',
        },
        CLEAR_LOGS: {
          actions: ['clearLogsAction', 'broadcastLogsCleared'],
        },
        REQUEST_LOGS_UPDATE: {
          actions: 'broadcastLogsUpdate',
        },
      },
    },
  },
}); 