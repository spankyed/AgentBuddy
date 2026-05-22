import { createLogger } from '@/core/shared/debug/logger';

// Toggle this flag to enable/disable brain inspect logs. Default ON in dev so
// switch/action/flow transitions are visible without the user having to click
// the toggle in the UI; the persisted setting (if any) takes over once the
// brain system hydrates — see brain/system.ts toggleInspect.
export let INSPECT_ENABLED = process.env.NODE_ENV !== 'production';

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
