import { bus } from '@/systems/_backend/backend';
import { logs } from './system';
import type { LogLevel } from './types';
import { backendActor } from '@/router/context';

class Logger {
  private source?: string;

  constructor(source?: string) {
    this.source = source;
  }

  private log(level: LogLevel, message: string, meta?: Record<string, any>) {
    const actor = backendActor;
    
    if (!actor) {
      // Fallback to console if bus is not initialized
      console[level](this.source ? `[${this.source}]` : '', message, meta);
      return;
    }

    // Get stack trace for errors
    let stack: string | undefined;
    if (level === 'error') {
      const err = new Error();
      stack = err.stack;
    }

    actor.system.get(logs).send({
      type: 'ADD_LOG',
      level,
      message,
      source: this.source,
      meta,
      stack,
    });

    // Also log to console for development
    if (process.env.NODE_ENV === 'development') {
      const prefix = this.source ? `[${this.source}]` : '';
      console[level](prefix, message, meta);
    }
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
export const logger = new Logger();

// Export a factory function to create loggers with specific sources
export function createLogger(source: string) {
  return new Logger(source);
}

// Export convenience functions that match console API
export const log = {
  debug: (message: string, meta?: Record<string, any>) => logger.debug(message, meta),
  info: (message: string, meta?: Record<string, any>) => logger.info(message, meta),
  warn: (message: string, meta?: Record<string, any>) => logger.warn(message, meta),
  error: (message: string, meta?: Record<string, any>) => logger.error(message, meta),
}; 