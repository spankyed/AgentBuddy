// A registry's shutdown hooks: the ones each pack declares (boot.onShutdown), keyed by pack id, and the app's
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPackRegistry } from '../../src/packs/pack-registration.ts';

const { registerShutdownHook, removeShutdownHooksForKey, runShutdownHooks, runShutdownHooksForKey } = createPackRegistry();

afterEach(() => {
  for (const key of ['_global', 'pack-a', 'pack-b']) removeShutdownHooksForKey(key);
  vi.restoreAllMocks();
});

describe('shutdown hooks', () => {
  it('runShutdownHooks calls every registered hook', () => {
    const calls: string[] = [];
    registerShutdownHook(() => calls.push('global'));
    registerShutdownHook(() => calls.push('pack-a'), 'pack-a');

    runShutdownHooks();

    expect(calls).toEqual(['global', 'pack-a']);
  });

  it('keeps running the other hooks when one throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const calls: string[] = [];
    registerShutdownHook(() => { throw new Error('boom'); });
    registerShutdownHook(() => calls.push('after-error'));

    runShutdownHooks();

    expect(calls).toEqual(['after-error']);
  });

  it("runShutdownHooksForKey runs and drops only that pack's hooks", () => {
    const calls: string[] = [];
    registerShutdownHook(() => calls.push('a'), 'pack-a');
    registerShutdownHook(() => calls.push('b'), 'pack-b');

    runShutdownHooksForKey('pack-a');
    runShutdownHooksForKey('pack-a');
    expect(calls).toEqual(['a']);

    removeShutdownHooksForKey('pack-b');
    runShutdownHooks();
    expect(calls).toEqual(['a']);
  });
});
