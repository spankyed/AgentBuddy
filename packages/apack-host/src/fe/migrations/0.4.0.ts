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
 * **This is a pack's key, moved by the host, and today that is the only thing that works.** The two
 * alternatives are both refused: a fallback read in the code surface is the dual-read `CLAUDE.md` forbids,
 * and leaving the key on its old name splits the vocabulary at the one place a user would never see it.
 *
 * **A pack cannot own this yet, and the obstacle is ordering rather than a missing hook.** This runs at
 * `renderer/src/main.ts:50`, before the shell, because the shell reads these keys as it starts — and at
 * that point a pack has contributed nothing: its frontend module has not loaded, and its declaration has
 * not arrived either, the catalog coming from the backend after the shell connects. So neither a
 * registered function nor declared data is reachable here. Moving this to a pack means first deciding
 * when a window's storage is migrated relative to the shell that reads it, which is a change to boot
 * order, not a new manifest key.
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
