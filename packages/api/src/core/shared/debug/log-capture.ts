import type { LogLevel } from '../../../systems/logs/types';
import { rootEvents } from '../../router/bus-emitter';

// Store original console methods
export const originalConsole = {
  log: console.log,
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

// Override console methods to capture logs
export function initializeLogCapture() {
  const captureLog = (level: LogLevel, originalMethod: Function) => {
    return function (...args: any[]) {
      // Call original console method
      originalMethod.apply(console, args);

      // If no arguments, use empty message
      if (args.length === 0) {
        rootEvents.emitLog({
          level,
          message: '',
        });
        return;
      }

      // First argument becomes the message
      const firstArg = args[0];
      let message: string;
      let stack: string | undefined;

      // Handle first argument
      if (typeof firstArg === 'string') {
        message = firstArg;
      } else {
        // Stringify non-string first arguments
        message = JSON.stringify(firstArg);

        // For errors, extract stack trace
        if (level === 'error' && firstArg instanceof Error) {
          message = firstArg.message || firstArg.toString();
          stack = firstArg.stack;
        }
      }

      // Collect remaining arguments as meta
      let meta: Record<string, any> | undefined;
      if (args.length > 1) {
        // If there's only one additional argument and it's an object, use it directly
        if (args.length === 2 && typeof args[1] === 'object' && args[1] !== null && !Array.isArray(args[1])) {
          meta = args[1];
        } else {
          // Otherwise, create an object with indexed keys
          meta = {};
          for (let i = 1; i < args.length; i++) {
            meta[`arg${i}`] = args[i];
          }
        }
      }

      // Emit log event
      const logEvent: Parameters<typeof rootEvents.emitLog>[0] = {
        level,
        message,
      };

      if (meta) {
        logEvent.meta = meta;
      }

      if (stack) {
        logEvent.stack = stack;
      }

      rootEvents.emitLog(logEvent);
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