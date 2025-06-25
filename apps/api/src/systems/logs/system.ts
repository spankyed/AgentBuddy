import { assign, setup, sendParent, enqueueActions, fromCallback, spawnChild } from 'xstate';
import { fromSystem, systemBus, type MergeReceivable } from '@/shared/utils/event-helpers';
import { emit } from '@/shared/utils/actor-helpers';
import type { LogsState, LogEntry } from './types';
import { z } from 'zod';
import { randomId } from '@/shared/utils/random-id';
import { rootEvents } from './log-events';
import { LogEvent } from './logger';
import { IncomingSystemEvents } from '@/shared/events';

export const logs = 'logs' as const;

const busEvent = systemBus(logs);

export const IncomingLogEvents = [
  busEvent('EMPTY', { empty: z.string() }),
  busEvent('CLEAR_LOGS', {}),
] as const

export type LogsInternalEvents = 
  | { type: "CLIENT_CONNECTED" }
  | { type: 'REQUEST_LOGS_UPDATE' }
  | {
    type: 'ADD_LOG';
    log: Omit<LogEntry, 'id' | 'timestamp'>;
  };

type ReceivableEvents = MergeReceivable<typeof IncomingLogEvents, LogsInternalEvents>;

export type OutgoingLogsEvents =
  | { type: 'LOGS_STARTUP'; logs: LogEntry[] }
  | { type: 'LOGS_UPDATE'; logs: LogEntry[] }
  | { type: 'LOG_ADDED'; log: LogEntry }
  | { type: 'LOGS_CLEARED' };

export interface LogsContext {
  logs: LogEntry[];
  maxLogs: number;
}

export const LogsSystemEvents = fromSystem(IncomingLogEvents)<OutgoingLogsEvents, typeof logs>();

export const logsSystem = setup({
  types: {
    context: {} as LogsContext,
    events: {} as ReceivableEvents,
  },
  actors: {
    setupEventListeners: fromCallback(({ sendBack }) => {
      const logHandler = (event: LogEvent) => {
        sendBack({
          type: 'ADD_LOG',
          log: event
        });
      };

      const incomingHandler = (event: IncomingSystemEvents) => {
        if (event.systemId === 'logs') {
          const { systemId, ...actualEvent } = event;
          sendBack(actualEvent);
        }
      };

      const connectedHandler = () => {
        sendBack({ type: 'CLIENT_CONNECTED' });
      };

      const onLogUnsub = rootEvents.onLog(logHandler)
      const onIncomingUnsub = rootEvents.onIncoming(incomingHandler)
      const onConnectedUnsub = rootEvents.onConnected(connectedHandler)

      return () => {
        onLogUnsub();
        onIncomingUnsub();
        onConnectedUnsub();
      };
    }),
  },
  actions: {
    setupEventListeners: spawnChild('setupEventListeners'),
    clearLogs: assign({ logs: () => [] }),
    addLog: assign({
      logs: ({ context, event }) => {
        const { log } = event as Extract<ReceivableEvents, { type: 'ADD_LOG' }>;
        const newLog: LogEntry = {
          ...log,
          id: randomId(),
          timestamp: Date.now(),
        };
        
        const updatedLogs = [...context.logs, newLog];
        
        // Keep only the last maxLogs entries
        if (updatedLogs.length > context.maxLogs) {
          return updatedLogs.slice(updatedLogs.length - context.maxLogs);
        }
        
        return updatedLogs;
      }
    }),
    sendLogsStartup: ({ context }) => {
      const wrapped = emit(logs, {
        type: 'LOGS_STARTUP',
        logs: context.logs,
      });
      rootEvents.emitOutgoing(wrapped.event);
    },
    broadcastNewLog: ({ context }) => {
      const wrapped = emit(logs, {
        type: 'LOG_ADDED',
        log: context.logs[context.logs.length - 1],
      });
      rootEvents.emitOutgoing(wrapped.event);
    },
    broadcastLogsUpdate: ({ context }) => {
      const wrapped = emit(logs, {
        type: 'LOGS_UPDATE',
        logs: context.logs,
      });
      rootEvents.emitOutgoing(wrapped.event);
    },
    broadcastLogsCleared: () => {
      const wrapped = emit(logs, {
        type: 'LOGS_CLEARED',
      });
      rootEvents.emitOutgoing(wrapped.event)
    },
  },
}).createMachine({
  id: logs,
  initial: 'active',
  context: {
    logs: [],
    maxLogs: 1000,
  },
  entry: ['setupEventListeners'],
  on: {
    CLIENT_CONNECTED: {
      actions: ['sendLogsStartup'],
    },
  },
  states: {
    active: {
      on: {
        'ADD_LOG': {
          actions: ['addLog', 'broadcastNewLog'],
        },
        CLEAR_LOGS: {
          actions: ['clearLogs', 'broadcastLogsCleared'],
        },
        REQUEST_LOGS_UPDATE: {
          actions: 'broadcastLogsUpdate',
        },
      },
    },
  },
}); 