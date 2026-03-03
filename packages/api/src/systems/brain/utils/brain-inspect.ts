import { createLogger } from '@/core/utils/debug/logger';

// Toggle this flag to enable/disable brain inspect logs
export let INSPECT_ENABLED = false;

// Create a logger instance for the brain system
const logger = createLogger('brain');

/**
 * Brain-specific inspect logger that respects the INSPECT_ENABLED flag
 * @param message - Inspect message to log
 * @param meta - Optional metadata to include with the log
 */
export function brainInspect(message: string, meta?: Record<string, any>) {
  if (INSPECT_ENABLED) {
    logger.debug(message, meta);
  }
}

/**
 * Toggle brain inspect logging on or off
 * @param enabled - Whether to enable inspect logging
 */
export function setBrainInspectEnabled(enabled: boolean) {
  INSPECT_ENABLED = enabled;
}

/**
 * Get the current state of brain inspect logging
 * @returns Whether brain inspect logging is enabled
 */
export function isBrainInspectEnabled(): boolean {
  return INSPECT_ENABLED;
}

// Export the full logger for non-debug logging (info, warn, error)
export { logger as brainLogger };
