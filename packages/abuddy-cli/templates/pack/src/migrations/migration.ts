// Runs once when the pack updates past the version this migration targets. The version is the key the
// manifest files it under, and the map it goes in says what that version is a version of — this pack's own
// by default (`"migrations": { "pack": { "__VERSION__": "…" } }`), or `"app"` for data whose shape follows
// AgentBuddy's releases rather than this pack's. Neither is repeated here.
import type { DeclaredMigration } from '@abuddy/sdk/framework';

export const migration: DeclaredMigration = {
  description: 'Describe what this migration changes',
  // Synchronous, and safe to run again: it runs on every development boot, on each beta of its release,
  // and after a data reset — so check whether the change is needed before applying it
  up: () => {
  },
};
