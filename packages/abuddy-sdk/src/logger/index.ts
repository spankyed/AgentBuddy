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

export function createLogger(source?: string): Logger {
  let _inner: Logger;
  const resolve = () => _inner ??= mod().createLogger(source);
  return new Proxy({} as Logger, {
    get(_, prop) {
      return resolve()[prop as keyof Logger];
    },
  });
}

export interface InspectLogger {
  inspect: (message: string, meta?: Record<string, unknown>) => void;
  logger: Logger;
  setEnabled: (enabled: boolean) => void;
  isEnabled: () => boolean;
}

const _nsEnabled = new Map<string, boolean>();

export function createInspectLogger(namespace: string): InspectLogger {
  const logger = createLogger(namespace);
  if (!_nsEnabled.has(namespace)) {
    _nsEnabled.set(namespace, process.env.NODE_ENV !== 'production');
  }

  return {
    inspect(message: string, meta?: Record<string, unknown>) {
      if (_nsEnabled.get(namespace)) logger.debug(message, meta);
    },
    logger,
    setEnabled(value: boolean) { _nsEnabled.set(namespace, value); },
    isEnabled() { return _nsEnabled.get(namespace) ?? false; },
  };
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
