import type { Migration } from './types';

/**
 * Ordered list of data migrations. Each migration's `fromVersion` must match
 * the previous migration's `toVersion` to form a valid chain.
 *
 * Add new migrations to the end of this array.
 */
export const migrations: Migration[] = [
  // Example:
  // {
  //   fromVersion: '0.1.0',
  //   toVersion: '0.2.0',
  //   description: 'Add metadata field to thread entities',
  //   migrate() { ... }
  // },
];

/**
 * The data version this app expects after all migrations have run.
 * Must match the last migration's `toVersion`, or the initial version
 * if no migrations exist.
 */
export const TARGET_DATA_VERSION = '0.1.0';
