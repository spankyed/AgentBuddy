// The app's data survives a restart: the store the API's composition opens (openAppStore) persists the
// engine's writes, and a store opened again hydrates them back
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-restart-persistence-'));
process.env.APACK_ENV = 'test';
process.env.APACK_USER_DATA_DIR = dataDir;
const { openAppStore } = await import('../../src/runtime/index.ts');
const { untypedCreate, getEntitiesOfType } = await import('@apackdev/sdk/ears');
const { _getLmdbPath } = await import('@apackdev/sdk/utils');
const { unbindHost } = await import('@apackdev/sdk/runtime/internals');

afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));

/** The adapter flushes in a microtask */
const flushed = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('the API store across a restart', () => {
  it('hydrates what the previous run wrote', async () => {
    const first = openAppStore();
    expect(_getLmdbPath().startsWith(dataDir)).toBe(true);
    untypedCreate('Prompt', { id: 'Prompt-restart' }).set('title', 'written before the restart');
    await flushed();
    first.store.close();
    // A new process starts with nothing bound, and a new, empty engine
    unbindHost();

    const second = openAppStore();
    try {
      expect(second.engine).not.toBe(first.engine);
      expect(getEntitiesOfType('Prompt')).toEqual([]);
      await second.store.hydrate();
      expect(getEntitiesOfType('Prompt')).toEqual(['Prompt-restart']);
      expect(second.engine.getAttr('Prompt-restart', 'title')).toBe('written before the restart');
    } finally {
      second.store.close();
    }
  });
});
