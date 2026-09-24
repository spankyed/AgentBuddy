export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  source?: string;
  meta?: Record<string, any>;
  stack?: string;
}

export interface LogsState {
  logs: LogEntry[];
  maxLogs: number;
}

// ── This feature's settings ───────────────────────────────────────────────
// Its own shape, which the app stores without knowing: the app owns the document, each feature its slice.
export interface LogsSettings {
  maxLogs: number; // Maximum number of logs to keep in memory
  excludedSources: string[]; // Array of source patterns to exclude from display
  showAppEvents?: boolean; // When false/undefined, hide `app-events` source logs from the list
}

export type IncomingLogEvents =
  | { type: 'CLEAR_LOGS' }
  | { type: 'REQUEST_LOGS_UPDATE' };

export type LogsInternalEvents =
  | {
    type: 'ADD_LOG';
    log: Omit<LogEntry, 'id' | 'timestamp'>;
  };

export type OutgoingLogsEvents =
  | { type: 'LOGS_CONNECTED'; logs: LogEntry[]; settings?: LogsSettings }
  | { type: 'LOGS_UPDATE'; logs: LogEntry[] }
  | { type: 'LOG_ADDED'; log: LogEntry }
  | { type: 'LOGS_CLEARED' };

export interface LogsContext {
  logs: LogEntry[];
}
