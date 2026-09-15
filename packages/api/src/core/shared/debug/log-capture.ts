import { formatWithOptions, type InspectOptions } from 'node:util';
import type { LogLevel } from './logger';
import { rootEvents } from '../../router/bus-emitter';
import { redactSecretText } from '@abuddy/sdk/utils/pure';

// Store original console methods
export const originalConsole = {
  log: console.log,
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

/** The console's own formatting, without colors: the text also goes to the log sinks */
const INSPECT_OPTIONS: InspectOptions = { colors: false };

/**
 * The arguments as the console prints them, with API keys redacted. The arguments are only read, never copied or
 * changed, and formatting never throws out of a console call.
 */
function formatArgs(args: unknown[]): string {
  try {
    return redactSecretText(formatWithOptions(INSPECT_OPTIONS, ...args));
  } catch (error) {
    // A getter or custom inspect that throws, say
    return `[console arguments that couldn't be formatted: ${redactSecretText(error instanceof Error ? error.message : String(error))}]`;
  }
}

// Override console methods to capture logs
export function initializeLogCapture() {
  const captureLog = (level: LogLevel, originalMethod: (...args: unknown[]) => void) => {
    return function (...args: unknown[]) {
      // Every sink (the console, log events, app-events.log) gets the same redacted text, as Logger.log's do
      const message = formatArgs(args);
      originalMethod.call(console, message);
      rootEvents.emitLog({ level, message });
    };
  };

  // Override console methods
  console.log = captureLog('info', originalConsole.log);
  console.debug = captureLog('debug', originalConsole.debug);
  console.info = captureLog('info', originalConsole.info);
  console.warn = captureLog('warn', originalConsole.warn);
  console.error = captureLog('error', originalConsole.error);
}

// Restore original console methods (useful for testing)
export function restoreConsole() {
  console.log = originalConsole.log;
  console.debug = originalConsole.debug;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
}
