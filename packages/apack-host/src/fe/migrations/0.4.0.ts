import type { FrontendMigration, WindowStorage } from './index.ts';

/**
 * The surface a window last had open is the host's (`AppState`, `SET_LAST_ACTIVE_SURFACE`), stored under the
 * surface's ref. Before 0.4.0 each window kept its own copy here, under a bare feature id nothing reads any more.
 */
function dropTheWindowsOwnLastActive(storage: WindowStorage): void {
  storage.removeItem('apack-last-active-plugin');
}

/**
 * The code surface's open tabs, under a key that named the surface a plugin.
 *
 * **This is a pack's key, moved by the host, and that is a seam rather than a decision.** A pack has no
 * frontend-migration hook of its own — `runFrontendMigrations` is the only thing that runs before a window's
 * storage is read — and the alternatives were worse: a fallback read in the code surface is the dual-read
 * `CLAUDE.md` forbids, and leaving the key on its old name leaves the vocabulary split across the one place a
 * user would never see it. Give packs their own window migrations and this moves there unchanged.
 */
function moveTheCodeSurfacesOpenTabs(storage: WindowStorage): void {
  const stored = storage.getItem('code-plugin-open-tabs');
  if (stored === null) return;
  storage.setItem('code-surface-open-tabs', stored);
  storage.removeItem('code-plugin-open-tabs');
}

export const migration: FrontendMigration = {
  target: '0.4.0',
  description: 'Move what a window stored under the surface\'s old plugin names',
  up: (storage) => { dropTheWindowsOwnLastActive(storage); moveTheCodeSurfacesOpenTabs(storage); },
};
