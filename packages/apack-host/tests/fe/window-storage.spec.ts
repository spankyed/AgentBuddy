// A window's own migrations move what it keeps in its storage forward, before the shell reads those keys. They run
// on a fake here, not on a window's localStorage: the runner is given its storage, so it decides what moves and a
// window says where that is kept.
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

describe('a window\'s migrations', () => {
  // The host keeps the last active surface now; the window's own copy would linger forever
  it('drops the last active surface a window stored before 0.4.0, and leaves the panel sizes', () => {
    const { storage, items } = fakeStorage({
      'apack-window-storage-version': '0.3.14',
      'apack-last-active-plugin': 'threads',
      'apack-panel-sizes': '{"panel":30}',
    });

    runWindowStorageMigrations(storage, '0.4.0');
    // Again, as the next window's boot does
    runWindowStorageMigrations(storage, '0.4.0');

    expect(items.get('apack-last-active-plugin')).toBeUndefined();
    expect(items.get('apack-panel-sizes')).toBe('{"panel":30}');
  });

  it('records the app version it migrated the storage to', () => {
    const { storage, items } = fakeStorage();

    runWindowStorageMigrations(storage, '0.4.0');

    expect(items.get('apack-window-storage-version')).toBe('0.4.0');
  });

  // Storage with no version is a window that never ran them: every migration is older than the app, so all run
  it('runs a migration for storage that names no version', () => {
    const { storage, items } = fakeStorage({ 'apack-last-active-plugin': 'threads' });

    runWindowStorageMigrations(storage, '0.4.0');

    expect(items.get('apack-last-active-plugin')).toBeUndefined();
  });

  it("leaves storage alone once it is at the app's version", () => {
    const { storage, items } = fakeStorage({ 'apack-window-storage-version': '0.4.0', 'apack-last-active-plugin': 'kept' });

    runWindowStorageMigrations(storage, '0.4.0');

    expect(items.get('apack-last-active-plugin')).toBe('kept');
  });
});
