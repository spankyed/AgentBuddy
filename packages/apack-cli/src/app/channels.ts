import type { AppChannel } from '@apackdev/sdk/env';

/** Desktop product names; publication omits local preview builds. */
export const PRODUCT_NAMES = {
  production: 'apack',
  beta: 'apack Beta',
  preview: 'apack Preview',
} as const satisfies Record<AppChannel, string>;

export type PublishedAppChannel = 'production' | 'beta';
