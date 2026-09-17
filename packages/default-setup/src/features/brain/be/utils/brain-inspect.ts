import { createLogger } from '@abuddy/sdk/logger';

/** The brain's logger. Its debug messages follow the `brain` debug toggle, which the brain plugin's inspect switch sets. */
export const brainLogger = createLogger('brain', { debug: true });
