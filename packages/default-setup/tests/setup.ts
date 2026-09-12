import * as path from 'path';

/**
 * Minimal localStorage for FE code under test.
 *
 * Deliberately not jsdom: the only browser API these tests touch is
 * localStorage, and jsdom installs a TextEncoder whose Uint8Array comes from
 * another realm, which trips esbuild's `encode("") instanceof Uint8Array`
 * invariant during transform and fails collection. That happens before
 * setupFiles run, so it cannot be patched from here.
 */
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  // FE code guards browser-only paths with `typeof window === 'undefined'`
  // (e.g. terminalEventBus.prunePersistedOutputs), so window must exist or
  // those paths silently no-op.
  globalThis.window ??= globalThis as unknown as Window & typeof globalThis;
  globalThis.localStorage = {
    get length() { return store.size; },
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => [...store.keys()][i] ?? null,
  } as Storage;
}
import '@/setup/sdk-host-init';
import { registerPack, getRegisteredEntityTypes } from '@abuddy/sdk/packs';
import { setCompiledDir } from '../src/__generated__/seeders';
import { registration } from '../src/__generated__/pack-entry';

setCompiledDir(path.resolve(__dirname, '..', 'dist'));

if (!getRegisteredEntityTypes().has('Action')) {
  registerPack(registration);
}
