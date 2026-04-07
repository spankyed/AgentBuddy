/**
 * Example frontend migration file.
 *
 * To use:
 * 1. Copy this file and rename to the target version (e.g., 0.0.4.ts)
 * 2. Import and register in index.ts:
 *    import { migration as m004 } from './0.0.4';
 *    const migrations: FrontendMigration[] = [m004];
 */

import type { FrontendMigration } from './index';

export const migration: FrontendMigration = {
  target: '0.0.3',
  description: 'Rename example localStorage key',
  up: () => {
    // Rename a key
    const old = localStorage.getItem('old-key');
    if (old !== null) {
      localStorage.setItem('new-key', old);
      localStorage.removeItem('old-key');
    }

    // Update a value
    const data = localStorage.getItem('agentbuddy-last-active-plugin');
    if (data === 'agent') {
      localStorage.setItem('agentbuddy-last-active-plugin', 'threads');
    }
  },
};
