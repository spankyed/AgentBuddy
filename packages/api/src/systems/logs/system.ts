import { assign, setup, sendParent, enqueueActions, fromCallback, spawnChild } from 'xstate';
import { fromSystem, systemBus, type MergeReceivable } from '@/core/utils/event-helpers';
import { emit, getActor, safeEvents } from '@/core/utils/actor-helpers';
import type { LogsState, LogEntry } from './types';
import { z } from 'zod';
import { randomId } from '@/core/utils/random-id';
import { rootEvents } from '../../core/router/bus-emitter';
import { LogEvent } from '../../core/utils/debug/logger';
import { IncomingSystemEvents } from '@/core/router/events';
import { repository } from '@/repository';
import type { LogsSettings } from '../settings/types';

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
  }
  | { type: 'LOGS_SETTINGS_UPDATED'; settings: LogsSettings; changes?: any };

type ReceivableEvents = MergeReceivable<typeof IncomingLogEvents, LogsInternalEvents>;

export type OutgoingLogsEvents =
  | { type: 'LOGS_STARTUP'; logs: LogEntry[]; settings?: LogsSettings }
  | { type: 'LOGS_UPDATE'; logs: LogEntry[] }
  | { type: 'LOG_ADDED'; log: LogEntry }
  | { type: 'LOGS_CLEARED' }
  | { type: 'LOGS_SETTINGS_UPDATED'; settings: LogsSettings };

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
      // Get current settings
      const settings = repository.settingsQueries.getPluginSettings('logs') as LogsSettings | undefined;
      const excludedSources = settings?.excludedSources || [];
      
      // Filter logs by excluded sources before sending
      let filteredLogs = context.logs;
      if (excludedSources.length > 0) {
        filteredLogs = context.logs.filter(log => {
          if (!log.source) return true; // Keep logs without sources
          
          const isExcluded = excludedSources.some(pattern => {
            // Support wildcards: convert * to regex
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
            return regex.test(log.source!);
          });
          
          return !isExcluded; // Keep only non-excluded logs
        });
      }
      
      const wrapped = emit(logs, {
        type: 'LOGS_STARTUP',
        logs: filteredLogs,
        settings: settings || { maxLogs: context.maxLogs, excludedSources: [] }
      });
      rootEvents.emitOutgoing(wrapped.event);
    },
    broadcastNewLog: ({ context }) => {
      const newLog = context.logs[context.logs.length - 1];
      
      // Get current settings from repository
      const settings = repository.settingsQueries.getPluginSettings('logs') as LogsSettings | undefined;
      const excludedSources = settings?.excludedSources || [];
      
      // Check if new log should be excluded
      if (newLog.source && excludedSources.length > 0) {
        const isExcluded = excludedSources.some(pattern => {
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
          return regex.test(newLog.source!);
        });
        
        if (isExcluded) {
          return; // Don't broadcast excluded logs
        }
      }
      
      const wrapped = emit(logs, {
        type: 'LOG_ADDED',
        log: newLog,
      });
      rootEvents.emitOutgoing(wrapped.event);
    },
    broadcastLogsUpdate: ({ context }) => {
      // Get current settings from repository
      const settings = repository.settingsQueries.getPluginSettings('logs') as LogsSettings | undefined;
      const excludedSources = settings?.excludedSources || [];
      
      // Filter logs by excluded sources before sending
      let filteredLogs = context.logs;
      if (excludedSources.length > 0) {
        filteredLogs = context.logs.filter(log => {
          if (!log.source) return true; // Keep logs without sources
          
          const isExcluded = excludedSources.some(pattern => {
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
            return regex.test(log.source!);
          });
          
          return !isExcluded; // Keep only non-excluded logs
        });
      }
      
      const wrapped = emit(logs, {
        type: 'LOGS_UPDATE',
        logs: filteredLogs,
      });
      rootEvents.emitOutgoing(wrapped.event);
    },
    broadcastLogsCleared: () => {
      const wrapped = emit(logs, {
        type: 'LOGS_CLEARED',
      });
      rootEvents.emitOutgoing(wrapped.event)
    },
    updateSettingsFromBackend: assign({
      maxLogs: ({ event }) => {
        const ev = event as Extract<ReceivableEvents, { type: 'LOGS_SETTINGS_UPDATED' }>;
        return ev.settings.maxLogs;
      }
    }),
    broadcastSettingsUpdate: ({ event }) => {
      const ev = event as Extract<ReceivableEvents, { type: 'LOGS_SETTINGS_UPDATED' }>;
      const wrapped = emit(logs, {
        type: 'LOGS_SETTINGS_UPDATED',
        settings: ev.settings
      });
      rootEvents.emitOutgoing(wrapped.event);
    },
    truncateLogsIfNeeded: assign({
      logs: ({ context }) => {
        // If logs exceed new maxLogs, truncate
        if (context.logs.length > context.maxLogs) {
          return context.logs.slice(context.logs.length - context.maxLogs);
        }
        return context.logs;
      }
    }),
  },
}).createMachine({
  id: logs,
  initial: 'active',
  context: () => {
    // Initialize with settings from repository
    const settings = repository.settingsQueries.getPluginSettings('logs') as LogsSettings | undefined;
    return {
      logs: [],
      maxLogs: settings?.maxLogs || 1000
    };
  },
  entry: ['setupEventListeners'],
  on: {
    CLIENT_CONNECTED: {
      actions: ['sendLogsStartup'],
    },
    LOGS_SETTINGS_UPDATED: {
      actions: ['updateSettingsFromBackend', 'truncateLogsIfNeeded', 'broadcastSettingsUpdate', 'broadcastLogsUpdate'],
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