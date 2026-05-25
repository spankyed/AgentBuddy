export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogEvent = {
  id: string;
  level: LogLevel;
  message: string;
  service: string;
  time: string;
};

export type LogsSurfaceState = {
  activeService: string;
  events: LogEvent[];
  filters: string[];
  query: string;
  services: Array<{count: number; id: string; label: string; status: 'healthy' | 'warning' | 'down'}>;
  streamState: 'connected' | 'paused';
};
