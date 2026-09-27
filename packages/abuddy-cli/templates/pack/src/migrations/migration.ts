import type { PackMigration } from '@abuddy/sdk/framework';

export const migration: PackMigration = {
  target: '__VERSION__',
  description: 'Describe what this migration changes',
  up: () => {
    // Check whether the change is needed before applying it
  },
};
