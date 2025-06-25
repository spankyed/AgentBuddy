import { v4 as uuid } from 'uuid';
import type { LogLevel, LogEntry } from './types';

// Console formatting styles
const logStyles = {
  debug: {
    label: 'DEBUG',
    primary: '\x1b[40m\x1b[97m', // Dark black background, white text for header
    secondary: '\x1b[100m\x1b[30m' // Grey background, black text for main
  },
  info: {
    label: 'INFO',
    primary: '\x1b[47m\x1b[30m', // White background, black text for header
    secondary: '\x1b[107m\x1b[97m' // Light white background, white text for main
  },
  warn: {
    label: 'WARN',
    primary: '\x1b[43m\x1b[97m', // Dark yellow background, white text for header
    secondary: '\x1b[103m\x1b[33m' // Light yellow background, dark yellow text for main
  },
  error: {
    label: 'ERROR',
    primary: '\x1b[41m\x1b[97m', // Dark red background, white text for header
    secondary: '\x1b[101m\x1b[31m' // Lighter red background, red text for main
  }
};

const formatStyles = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

// Format timestamp for console output
function formatTimestamp(date: Date) {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

// Format console output with colors and styles
function formatConsoleOutput(level: LogLevel, message: string, source?: string, meta?: Record<string, any>): string {
  const timestamp = formatTimestamp(new Date());
  const style = logStyles[level];
  const { primary, secondary, label } = style;
  const { bold, reset, dim } = formatStyles;
  
  const time = `[${dim}${timestamp}${reset}]`;
  const header = `${primary}${bold} ${label} ${reset}`;
  const sourceTag = source ? `${dim}[${source}]${reset}` : '';
  const main = `${secondary}${bold}${message}${reset}`;
  
  let output = `${time} ${header} ${sourceTag} ${main}`;
  
  // Add metadata if present
  if (meta && Object.keys(meta).length > 0) {
    const metaStr = JSON.stringify(meta, null, 2);
    output += `\n${dim}${metaStr}${reset}`;
  }
  
  return output;
}

// Global logs storage
export const globalLogs: LogEntry[] = [];
const MAX_LOGS = 1000;

// Allow verbose logging (can be controlled via environment variable)
const allowVerbose = process.env.NODE_ENV !== 'production';

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

  private log(level: LogLevel, message: string, meta?: Record<string, any>, verbose = false) {
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

    // Log to console with formatting (if not suppressed)
    if (allowVerbose || !verbose) {
      const formattedOutput = formatConsoleOutput(level, message, this.source, meta);
      console.log(formattedOutput);
    }
  }

  debug(message: string, meta?: Record<string, any>, verbose = false) {
    this.log('debug', message, meta, verbose);
  }

  info(message: string, meta?: Record<string, any>, verbose = false) {
    this.log('info', message, meta, verbose);
  }

  warn(message: string, meta?: Record<string, any>, verbose = false) {
    this.log('warn', message, meta, verbose);
  }

  error(message: string, meta?: Record<string, any>, verbose = false) {
    this.log('error', message, meta, verbose);
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
  debug: (message: string, meta?: Record<string, any>, verbose = false) => logger.debug(message, meta, verbose),
  info: (message: string, meta?: Record<string, any>, verbose = false) => logger.info(message, meta, verbose),
  warn: (message: string, meta?: Record<string, any>, verbose = false) => logger.warn(message, meta, verbose),
  error: (message: string, meta?: Record<string, any>, verbose = false) => logger.error(message, meta, verbose),
};

// Legacy support for logInfo function
export function logInfo(...messages: string[]) {
  const [first, ...rest] = messages;
  const meta = rest.length > 0 ? { details: rest } : undefined;
  logger.info(first, meta);
}

// Helper function to clear logs
export function clearLogs() {
  globalLogs.length = 0;
} 