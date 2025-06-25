import { v4 as uuid } from 'uuid';
import type { LogLevel, LogEntry } from './types';

// Global logs storage
export const globalLogs: LogEntry[] = [];
const MAX_LOGS = 1000;

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

// Initialize with mock logs on startup
export const initializeMockLogs = () => {
  const mockLogs: LogEntry[] = [
    {
      id: uuid(),
      timestamp: Date.now() - 10000,
      level: 'info',
      message: 'Application started successfully',
      source: 'backend',
    },
    {
      id: uuid(),
      timestamp: Date.now() - 9000,
      level: 'debug',
      message: 'Connecting to database...',
      source: 'database',
    },
    {
      id: uuid(),
      timestamp: Date.now() - 8500,
      level: 'info',
      message: 'Database connection established',
      source: 'database',
      meta: {
        host: 'localhost',
        port: 5432,
        database: 'agentbuddy'
      }
    },
    {
      id: uuid(),
      timestamp: Date.now() - 7000,
      level: 'info',
      message: 'Starting agent system',
      source: 'agent',
    },
    {
      id: uuid(),
      timestamp: Date.now() - 6000,
      level: 'warn',
      message: 'Rate limit approaching threshold',
      source: 'api',
      meta: {
        current: 85,
        limit: 100,
        resetIn: '5 minutes'
      }
    },
    {
      id: uuid(),
      timestamp: Date.now() - 5000,
      level: 'error',
      message: 'Failed to fetch user preferences',
      source: 'api',
      stack: `Error: Failed to fetch user preferences
    at fetchUserPreferences (/app/src/api/user.ts:45:11)
    at async handleRequest (/app/src/api/handler.ts:23:5)
    at async processRequest (/app/src/server.ts:156:3)`,
      meta: {
        userId: 'user-123',
        endpoint: '/api/preferences'
      }
    },
    {
      id: uuid(),
      timestamp: Date.now() - 4000,
      level: 'info',
      message: 'Retrying user preferences fetch...',
      source: 'api',
    },
    {
      id: uuid(),
      timestamp: Date.now() - 3500,
      level: 'info',
      message: 'Successfully fetched user preferences on retry',
      source: 'api',
    },
    {
      id: uuid(),
      timestamp: Date.now() - 2000,
      level: 'debug',
      message: 'Processing message from user',
      source: 'agent',
      meta: {
        messageId: 'msg-456',
        wordCount: 42
      }
    },
    {
      id: uuid(),
      timestamp: Date.now() - 1000,
      level: 'info',
      message: 'Generated response in 234ms',
      source: 'agent',
    },
    {
      id: uuid(),
      timestamp: Date.now() - 500,
      level: 'warn',
      message: 'Memory usage above 80%',
      source: 'system',
      meta: {
        used: '1.6GB',
        total: '2GB',
        percentage: 82
      }
    },
  ];

  // Clear existing logs and add mock logs
  globalLogs.length = 0;
  globalLogs.push(...mockLogs);
};

class Logger {
  private source?: string;

  constructor(source?: string) {
    this.source = source;
  }

  private log(level: LogLevel, message: string, meta?: Record<string, any>) {
    // Get stack trace for errors
    let stack: string | undefined;
    if (level === 'error') {
      const err = new Error();
      stack = err.stack;
    }

    // Create log entry with sanitized metadata
    const logEntry: LogEntry = {
      id: uuid(),
      timestamp: Date.now(),
      level,
      message,
      source: this.source,
      meta: meta ? safeStringify(meta) : undefined,
      stack,
    };

    // Add to global logs array
    globalLogs.push(logEntry);

    // Keep only the last MAX_LOGS entries
    if (globalLogs.length > MAX_LOGS) {
      globalLogs.splice(0, globalLogs.length - MAX_LOGS);
    }

    // Log to console
    const prefix = this.source ? `[${this.source}]` : '';
    console[level](prefix, message, meta);
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

// Helper function to clear logs
export function clearLogs() {
  globalLogs.length = 0;
} 