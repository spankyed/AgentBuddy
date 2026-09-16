import { getHostModule } from '../runtime/host.ts';
import type { Logger } from '../ears/runtime.ts';

/** The `logger` host module */
interface LoggerHost {
  createLogger(source?: string): Logger;
  onLog(callback: (event: LogEvent) => void): () => void;
}

let _mod: LoggerHost | undefined;
function mod() {
  return _mod ??= getHostModule<LoggerHost>('logger');
}

export type { Logger };

export interface LoggerOptions {
  /** Log `debug` messages only while the source's debug toggle is on (`setDebugEnabled`). It starts on outside production. */
  debug?: boolean;
}

const debugEnabled = new Map<string, boolean>();

/** Turns a source's gated `debug` messages on or off (loggers created with `{ debug: true }`) */
export function setDebugEnabled(source: string, enabled: boolean): void {
  debugEnabled.set(source, enabled);
}

/** Whether a source's gated `debug` messages are logged */
export function isDebugEnabled(source: string): boolean {
  return debugEnabled.get(source) ?? process.env.NODE_ENV !== 'production';
}

/** A logger whose entries carry `source`; with `{ debug: true }` its `debug` messages follow the source's debug toggle */
export function createLogger(source?: string, options: LoggerOptions = {}): Logger {
  let _inner: Logger;
  const resolve = () => _inner ??= mod().createLogger(source);
  const gate = options.debug && source !== undefined ? source : undefined;
  return new Proxy({} as Logger, {
    get(_, prop) {
      if (prop === 'debug' && gate !== undefined) {
        return (...args: unknown[]) => { if (isDebugEnabled(gate)) resolve().debug(...args); };
      }
      return resolve()[prop as keyof Logger];
    },
  });
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogEvent = {
  level: LogLevel;
  message: string;
  source?: string;
  meta?: Record<string, unknown>;
  stack?: string;
}

/** Calls `callback` with every log entry the app records; returns the unsubscribe (backend only) */
export function onLog(callback: (event: LogEvent) => void): () => void {
  return mod().onLog(callback);
}
