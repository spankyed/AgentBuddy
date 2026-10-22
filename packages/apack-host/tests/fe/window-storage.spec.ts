// A window's own storage moved forward when the app it belongs to is newer than the data. The runner is given
// its storage, so it decides what moves and a window says where that is kept — which is why these cases run on
// a fake rather than a window's `localStorage`.
//
// **There are no migrations to run today**, and that is the state these cases pin: the app has never shipped, so
// the rename that would have needed the first one simply renamed the keys. What is left to check is the runner
// around an empty list — that it records the version regardless, so a first real migration has a baseline, and
// that it leaves a window alone when there is nothing to do.
import { describe, expect, it } from 'vitest';
import { runWindowStorageMigrations, type WindowStorage } from '../../src/fe/index.ts';

/** A window's storage, in memory */
function fakeStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  const storage: WindowStorage = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => { items.set(key, value); },
    removeItem: (key) => { items.delete(key); },
  };
  return { storage, items };
}

describe("a window's storage migrations", () => {
  it('records the app version it migrated the storage to', () => {
    const { storage, items } = fakeStorage();

    runWindowStorageMigrations(storage, '0.4.0');

    expect(items.get('apack-window-storage-version')).toBe('0.4.0');
  });

  // The list is empty, so every key a window holds is one the runner has nothing to say about
  it('leaves what a window holds alone while no migration targets it', () => {
    const { storage, items } = fakeStorage({ 'apack-panel-sizes': '{"panel":30}', 'host/packs:tab': 'installed' });

    runWindowStorageMigrations(storage, '0.4.0');
    // Again, as the next window's boot does
    runWindowStorageMigrations(storage, '0.4.0');

    expect(items.get('apack-panel-sizes')).toBe('{"panel":30}');
    expect(items.get('host/packs:tab')).toBe('installed');
  });

  it("writes the version for storage that named none, so a first migration has a baseline", () => {
    const { storage, items } = fakeStorage({ 'apack-panel-sizes': '{}' });

    runWindowStorageMigrations(storage, '0.5.0');

    expect(items.get('apack-window-storage-version')).toBe('0.5.0');
  });
});
