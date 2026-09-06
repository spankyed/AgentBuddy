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

export function createInspectLogger(namespace: string): InspectLogger {
  const logger = createLogger(namespace);
  let enabled = process.env.NODE_ENV !== 'production';

  return {
    inspect(message: string, meta?: Record<string, any>) {
      if (enabled) logger.debug(message, meta);
    },
    logger,
    setEnabled(value: boolean) { enabled = value; },
    isEnabled() { return enabled; },
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
