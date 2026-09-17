// The app's data survives a restart: the store the API's composition opens (openAppStore) persists the
// engine's writes, and a store opened again hydrates them back
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-restart-persistence-'));
process.env.ABUDDY_ENV = 'test';
process.env.ABUDDY_USER_DATA_DIR = dataDir;
const { openAppStore } = await import('@/setup/backend');
const { tx, getEntitiesOfType } = await import('@abuddy/ears');
const { getLmdbPath } = await import('@abuddy/sdk/utils');
const { unbindHost } = await import('@abuddy/sdk/runtime');

afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));

/** The adapter flushes in a microtask */
const flushed = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('the API store across a restart', () => {
  it('hydrates what the previous run wrote', async () => {
    const first = openAppStore();
    expect(getLmdbPath().startsWith(dataDir)).toBe(true);
    tx('Note-restart' as never, true).put('entityType', 'Note').put('title', 'written before the restart');
    await flushed();
    first.store.close();
    // A new process starts with nothing bound, and a new, empty engine
    unbindHost();

    const second = openAppStore();
    try {
      expect(second.engine).not.toBe(first.engine);
      expect(getEntitiesOfType('Note')).toEqual([]);
      await second.store.hydrate({ skipTombstoneScan: true });
      expect(getEntitiesOfType('Note')).toEqual(['Note-restart']);
      expect(second.engine.query.getAttr('Note-restart' as never, 'title')).toBe('written before the restart');
    } finally {
      second.store.close();
    }
  });
});
