import { createLogger } from '@/core/utils/debug/logger';

// Toggle this flag to enable/disable brain debug logs
export let DEBUG_ENABLED = false;

// Create a logger instance for the brain system
const logger = createLogger('brain');

/**
 * Brain-specific debug logger that respects the DEBUG_ENABLED flag
 * @param message - Debug message to log
 * @param meta - Optional metadata to include with the log
 */
export function brainDebug(message: string, meta?: Record<string, any>) {
  if (DEBUG_ENABLED) {
    logger.debug(message, meta);
  }
}

/**
 * Toggle brain debug logging on or off
 * @param enabled - Whether to enable debug logging
 */
export function setBrainDebugEnabled(enabled: boolean) {
  DEBUG_ENABLED = enabled;
}

/**
 * Get the current state of brain debug logging
 * @returns Whether brain debug logging is enabled
 */
export function isBrainDebugEnabled(): boolean {
  return DEBUG_ENABLED;
}

// Export the full logger for non-debug logging (info, warn, error)
export { logger as brainLogger };