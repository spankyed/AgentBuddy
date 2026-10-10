// Runs once when the pack updates past the version this migration targets. The version is the key the
// manifest files it under (`"migrations": { "__VERSION__": "…" }`), so it is not repeated here.
import type { DeclaredMigration } from '@abuddy/sdk/framework';

export const migration: DeclaredMigration = {
  description: 'Describe what this migration changes',
  // Synchronous, and safe to run again: it runs on every development boot, on each beta of its release,
  // and after a data reset — so check whether the change is needed before applying it
  up: () => {
  },
};
