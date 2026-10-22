import type { WindowStorageMigration, WindowStorage } from './index.ts';

/**
 * The surface a window last had open is the host's (`AppState`, `SET_LAST_ACTIVE_SURFACE`), stored under the
 * surface's ref. Before 0.4.0 each window kept its own copy here, under a bare feature id nothing reads any more.
 */
function dropTheWindowsOwnLastActive(storage: WindowStorage): void {
  storage.removeItem('apack-last-active-plugin');
}

export const migration: WindowStorageMigration = {
  target: '0.4.0',
  description: 'Drop the last active surface this window stored, which the host now keeps',
  up: dropTheWindowsOwnLastActive,
};
