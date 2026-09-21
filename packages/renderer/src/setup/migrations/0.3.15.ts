import type { FrontendMigration } from './index';

/**
 * The plugin a window last had open is the host's (`AppState`, `SET_LAST_ACTIVE_PLUGIN`), stored under the
 * plugin's ref. Before 0.3.15 each window kept its own copy here, under a bare feature id nothing reads any more.
 */
export const migration: FrontendMigration = {
  target: '0.3.15',
  description: 'Drop the last active plugin this window stored, which the host now keeps',
  up: () => localStorage.removeItem('agentbuddy-last-active-plugin'),
};
