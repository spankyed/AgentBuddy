export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogEntry = {
  expanded?: boolean;
  id: string;
  level: LogLevel;
  message: string;
  meta?: Record<string, string | number | boolean>;
  source?: string;
  timestamp: string;
};

export type LogsSurfaceState = {
  appEventsEnabled: boolean;
  copied?: boolean;
  excludedSources: number;
  filterLevel: 'all' | LogLevel;
  logs: LogEntry[];
  searchTerm: string;
};
