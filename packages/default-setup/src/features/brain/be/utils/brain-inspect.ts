import { createLogger } from '@apackdev/sdk/logger';

/** The brain's logger. Its debug messages follow the `brain` debug toggle, which the brain surface's inspect switch sets. */
export const brainLogger = createLogger('brain', { debug: true });
