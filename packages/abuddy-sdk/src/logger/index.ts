import { getHostModule } from '../runtime/host';
import type { Logger } from '../ears/runtime';

let _mod: any;
function mod() {
  if (!_mod) _mod = getHostModule('logger');
  return _mod;
}

export type { Logger };

export function createLogger(source?: string): Logger {
  return mod().createLogger(source);
}

export interface InspectLogger {
  inspect: (message: string, meta?: Record<string, any>) => void;
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
    inspect(message: string, meta?: Record<string, any>) {
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
  meta?: Record<string, any>;
  stack?: string;
}

export const LogEventValue: any = new Proxy({} as any, {
  get(_, prop: string) { return mod().LogEvent[prop]; },
});
