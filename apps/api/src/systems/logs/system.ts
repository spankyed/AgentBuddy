import { assign, setup } from 'xstate';
import { v4 as uuid } from 'uuid';
import { fromSystem, systemBus } from '@/shared/utils/event-helpers';
import { bus, SystemEvents } from '@/systems/_backend/backend';
import { emit } from '@/shared/utils/actor-helpers';
import type { EARS } from '@/shared/ears/types';
import { LogEntry, type LogsState } from './types';
import { z } from 'zod';

export const logs = 'logs' as const;

const busEvent = systemBus(logs);

export const IncomingLogEvents = [
  busEvent('EMPTY', { empty: z.string() }),
] as const

export type LogsInternalEvents = 
  | SystemEvents
  | { type: 'ADD_LOG'; level: LogEntry['level']; message: string; source?: string; meta?: Record<string, any>; stack?: string }
  | { type: 'CLEAR_LOGS' };

export type OutgoingLogsEvents =
  | { type: 'LOGS_UPDATE'; logs: LogEntry[] }
  | { type: 'LOG_ADDED'; log: LogEntry }
  | { type: 'LOGS_CLEARED' };

export interface LogsContext extends LogsState {
  systemId: EARS.EntityId;
}

export const LogsSystemEvents = fromSystem(IncomingLogEvents)<OutgoingLogsEvents, typeof logs>();

export const logsSystem = setup({
  types: {
    input: {} as EARS.EntityId,
    context: {} as LogsContext,
    events: {} as LogsInternalEvents,
  },
  actions: {
    addLog: assign({
      logs: ({ context, event }) => {
        if (event.type !== 'ADD_LOG') return context.logs;
        
        const { level, message, source, meta, stack } = event;
        
        const newLog: LogEntry = {
          id: uuid(),
          timestamp: Date.now(),
          level,
          message,
          source,
          meta,
          stack,
        };

        // Keep only the last maxLogs entries
        const updatedLogs = [...context.logs, newLog];
        if (updatedLogs.length > context.maxLogs) {
          return updatedLogs.slice(-context.maxLogs);
        }
        return updatedLogs;
      },
    }),
    clearLogs: assign({
      logs: () => [],
    }),
    broadcastLogAdded: ({ context, system, event }) => {
      if (event.type !== 'ADD_LOG') return;
      
      const { level, message, source, meta, stack } = event;
      const newLog: LogEntry = {
        id: uuid(),
        timestamp: Date.now(),
        level,
        message,
        source,
        meta,
        stack,
      };
      
      system.get(bus).send(emit(logs, {
        type: 'LOG_ADDED',
        log: newLog,
      }));
    },
    broadcastLogsUpdate: ({ context, system }) => {
      system.get(bus).send(emit(logs, {
        type: 'LOGS_UPDATE',
        logs: context.logs,
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
    logs: [],
    maxLogs: 1000, // Keep last 1000 logs
  }),
  on: {
    CLIENT_CONNECTED: {
      actions: 'broadcastLogsUpdate',
    },
  },
  states: {
    active: {
      on: {
        ADD_LOG: {
          actions: ['addLog', 'broadcastLogAdded'],
        },
        CLEAR_LOGS: {
          actions: ['clearLogs', 'broadcastLogsCleared'],
        },
      },
    },
  },
}); 