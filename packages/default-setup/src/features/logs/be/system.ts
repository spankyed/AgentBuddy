import { assign, setup, sendParent, enqueueActions, fromCallback, spawnChild } from 'xstate';
import { defineSystem } from '@/core/framework/define-system';
import { emit, getActor } from '@/core/shared/actor-helpers';
import type { LogsState, LogEntry } from './types';
import { randomId } from '@/core/shared/random-id';
import { rootEvents } from '@/core/router/bus-emitter';
import { LogEvent } from '@/core/shared/debug/logger';
import { IncomingSystemEvents } from '@/core/router/events';
import { repository } from '@/repository';
import type { LogsSettings } from '../settings/types';
import { isSourceExcluded, filterLogsByExcludedSources } from './utils';

// Resolve the effective exclusion list: when showAppEvents is falsy, treat 'app-events' as excluded.
function effectiveExcludedSources(settings: LogsSettings | undefined): string[] {
  const base = settings?.excludedSources ?? [];
  return settings?.showAppEvents ? base : [...base, 'app-events'];
}

type IncomingLogEvents =
  | { type: 'EMPTY'; empty: string }
  | { type: 'CLEAR_LOGS' }
  | { type: 'REQUEST_LOGS_UPDATE' };

type LogsInternalEvents =
  | { type: 'REQUEST_LOGS_UPDATE' }
  | {
    type: 'ADD_LOG';
    log: Omit<LogEntry, 'id' | 'timestamp'>;
  }
  | { type: 'LOGS_SETTINGS_UPDATED'; settings: LogsSettings; changes?: any };

export type OutgoingLogsEvents =
  | { type: 'LOGS_CONNECTED'; logs: LogEntry[]; settings?: LogsSettings }
  | { type: 'LOGS_UPDATE'; logs: LogEntry[] }
  | { type: 'LOG_ADDED'; log: LogEntry }
  | { type: 'LOGS_CLEARED' }
  | { type: 'LOGS_SETTINGS_UPDATED'; settings: LogsSettings };

export interface LogsContext {
  logs: LogEntry[];
}

export const logsDef = defineSystem('logs')<IncomingLogEvents | LogsInternalEvents, OutgoingLogsEvents, LogsContext>();
export const logs = logsDef.id;

export const logsSystem = setup({
  types: logsDef.types,
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
        const { log } = logsDef.typeOf('ADD_LOG', event);
        
        const newLog: LogEntry = {
          ...log,
          id: randomId(),
          timestamp: Date.now(),
        };
        
        const updatedLogs = [newLog, ...context.logs];
        
        // Keep only the last maxLogs entries
        const settings = repository.settingsQueries.getPluginSettings('logs') as LogsSettings | undefined;

        if (updatedLogs.length > (settings?.maxLogs || 1000)) {
          return updatedLogs.slice(0, settings?.maxLogs || 1000);
        }
        
        return updatedLogs;
      }
    }),
    sendLogsConnected: ({ context }) => {
      // Get current settings
      const settings = repository.settingsQueries.getPluginSettings('logs') as LogsSettings | undefined;
      const excludedSources = effectiveExcludedSources(settings);

      // Filter logs by excluded sources before sending
      const filteredLogs = filterLogsByExcludedSources(context.logs, excludedSources);

      const wrapped = emit(logs, {
        type: 'LOGS_CONNECTED',
        logs: filteredLogs,
        settings: settings ?? { maxLogs: 1000, excludedSources: [], showAppEvents: false }
      });
      rootEvents.emitOutgoing(wrapped.event);
    },
    broadcastNewLog: ({ context }) => {
      const newLog = context.logs[0];

      // Get current settings from repository
      const settings = repository.settingsQueries.getPluginSettings('logs') as LogsSettings | undefined;
      const excludedSources = effectiveExcludedSources(settings);

      // Check if new log should be excluded
      if (isSourceExcluded(newLog.source, excludedSources)) {
        return; // Don't broadcast excluded logs
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
      const excludedSources = effectiveExcludedSources(settings);

      // Filter logs by excluded sources before sending
      const filteredLogs = filterLogsByExcludedSources(context.logs, excludedSources);

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
    truncateLogsIfNeeded: assign({
      logs: ({ context }) => {
        // If logs exceed new maxLogs, truncate
        const settings = repository.settingsQueries.getPluginSettings('logs') as LogsSettings | undefined;
        if (context.logs.length > (settings?.maxLogs || 1000)) {
          return context.logs.slice(context.logs.length - (settings?.maxLogs || 1000));
        }
        return context.logs;
      }
    }),
  },
}).createMachine({
  id: logs,
  initial: 'active',
  context: () => {
    return {
      logs: [],
    };
  },
  entry: ['setupEventListeners'],
  on: {
    CLIENT_CONNECTED: {
      actions: ['sendLogsConnected'],
    },
    LOGS_SETTINGS_UPDATED: {
      actions: ['truncateLogsIfNeeded', 'broadcastLogsUpdate'],
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
          actions: ['truncateLogsIfNeeded', 'broadcastLogsUpdate'],
        },
      },
    },
  },
}); 