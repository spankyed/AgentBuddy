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