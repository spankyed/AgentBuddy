import type { LogLevel, LogEntry } from '../../../systems/logs/types';
import { rootEvents } from '../../router/bus-emitter';
import { originalConsole } from './log-capture';

export type LogEvent = Omit<LogEntry, 'id' | 'timestamp'>

// Safely stringify objects that might contain circular references
function safeStringify(obj: any): any {
  const seen = new WeakSet();
  
  return JSON.parse(JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular Reference]';
      }
      seen.add(value);
    }
    // Also handle functions and other non-serializable types
    if (typeof value === 'function') {
      return '[Function]';
    }
    if (typeof value === 'undefined') {
      return '[Undefined]';
    }
    return value;
  }));
}

class Logger {
  public source?: string;

  constructor(source?: string) {
    this.source = source;
  }

  public log(level: LogLevel, message: string, meta?: Record<string, any>) {
    // Get stack trace for errors
    let stack: string | undefined;
    if (level === 'error') {
      // First, check if an error was passed in meta
      if (meta?.error) {
        if (meta.error instanceof Error) {
          stack = meta.error.stack;
        } else if (typeof meta.error === 'object' && meta.error.stack) {
          // Handle cases where error might be a plain object with a stack property
          stack = meta.error.stack;
        } else if (typeof meta.error === 'string') {
          // If error is just a string message, create stack trace from current location
          const err = new Error(meta.error);
          stack = err.stack;
        }
      } else {
        // Fallback: create new Error to get current stack trace
        const err = new Error(message);
        stack = err.stack;
      }
    }

    // Emit log event
    rootEvents.emitLog({
      level,
      message,
      source: this.source,
      meta: meta ? safeStringify(meta) : undefined,
      stack,
    });

    // Still log to console for debugging
    const prefix = this.source ? `[${this.source}]` : '';
    originalConsole[level](prefix, message, meta);
  }

  debug(message: string, meta?: Record<string, any>) {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: Record<string, any>) {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, any>) {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Record<string, any>) {
    this.log('error', message, meta);
  }
}

// Export a default logger instance
export const logger = new Logger('backend');

// Factory to create loggers with specific sources
export function createLogger(source?: string) {
  return new Logger(source);
}


// Convenience methods for quick logging
export const log = {
  debug: (message: string, meta?: Record<string, any>) => logger.debug(message, meta),
  info: (message: string, meta?: Record<string, any>) => logger.info(message, meta),
  warn: (message: string, meta?: Record<string, any>) => logger.warn(message, meta),
  error: (message: string, meta?: Record<string, any>) => logger.error(message, meta),
};
