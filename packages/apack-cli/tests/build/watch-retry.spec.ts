import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { DevReload } from '../../src/build/dev-reload.ts';
import { startPackBuildWatcher } from '../../src/build/watch.ts';

const fixture = vi.hoisted(() => ({
  authored: 'first',
  changed: undefined as undefined | ((event: string, file: string) => void),
  build: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
  reload: vi.fn<() => Promise<DevReload>>(async () => ({ status: 'reloaded' })),
}));
vi.mock('node:fs', async importOriginal => ({
  ...await importOriginal<typeof import('node:fs')>(),
  watch: vi.fn((_root: string, _options: unknown, receive: (event: string, file: string) => void) => {
    fixture.changed = receive;
    return { close: vi.fn() };
  }),
}));
vi.mock('../../src/build/build-process.ts', () => ({
  createPackBuilder: () => ({ build: fixture.build, close: fixture.close }),
}));
vi.mock('../../src/utils.ts', () => ({ readValidManifest: () => ({ id: 'fixture' }) }));
vi.mock('@apackdev/host/build/pack-inputs', () => ({
  isPackInputPath: () => true,
  packInputsHash: () => fixture.authored,
  packInputWatchTargets: () => [{ directory: '/fixture', relative: '' }],
}));
vi.mock('../../src/build/compiler-watch.ts', () => ({
  compilerWatchPaths: () => ({ paths: new Map(), complete: true, signature: 'compiler' }),
  mergeCompilerWatchPaths: () => new Map(),
  compilerWatchTargets: () => new Map(),
  createCompilerWatchMatcher: () => () => false,
}));
vi.mock('../../src/build/dev-reload.ts', () => ({ reloadPack: fixture.reload }));
vi.mock('../../src/build/frontend-watch.ts', () => ({
  createFrontendWatcher: () => ({
    snapshot: () => ({ hash: 'frontend', current: () => true }),
    accept: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  fixture.authored = 'first';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it.each(['build', 'install', 'reload', 'failed', 'unreachable'] as const)('retries identical inputs on a later save after %s fails', async failure => {
  const install = vi.fn(async () => {});
  const watcher = await startPackBuildWatcher('/fixture', { onBuilt: install });
  const save = async () => {
    fixture.changed!('change', 'apack.json');
    await vi.advanceTimersByTimeAsync(300);
  };
  try {
    if (failure === 'build') fixture.build.mockRejectedValueOnce(new Error('fixture build refused'));
    if (failure === 'install') install.mockRejectedValueOnce(new Error('fixture install refused'));
    if (failure === 'reload') fixture.reload.mockRejectedValueOnce(new Error('fixture reload refused'));
    if (failure === 'failed' || failure === 'unreachable') fixture.reload.mockResolvedValueOnce({ status: failure, detail: 'fixture refusal' });
    fixture.authored = 'second';
    await save();
    if (failure === 'failed' || failure === 'unreachable') expect(console.warn).toHaveBeenCalled();
    else expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Build/reload failed'));
    expect(fixture.build).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1_200);
    expect(fixture.build).toHaveBeenCalledTimes(2);

    // Another save may emit an event without changing the file bytes. The failed attempt
    // must not suppress its retry as if this input had already reached the running app.
    await save();
    expect(fixture.build).toHaveBeenCalledTimes(3);
    expect(install).toHaveBeenCalledTimes(failure === 'build' ? 1 : 2);
    expect(fixture.reload).toHaveBeenCalledTimes(['reload', 'failed', 'unreachable'].includes(failure) ? 2 : 1);

    // Once publication succeeds, duplicate saves still avoid unnecessary builds.
    await save();
    expect(fixture.build).toHaveBeenCalledTimes(3);
  } finally { await watcher.close(); }
});

it('keeps duplicate-save suppression when building without a running app', async () => {
  const watcher = await startPackBuildWatcher('/fixture');
  try {
    fixture.reload.mockResolvedValueOnce({ status: 'not-running', detail: 'no app' });
    fixture.authored = 'offline';
    fixture.changed!('change', 'apack.json');
    await vi.advanceTimersByTimeAsync(300);
    expect(fixture.build).toHaveBeenCalledTimes(2);
    fixture.changed!('change', 'apack.json');
    await vi.advanceTimersByTimeAsync(300);
    expect(fixture.build).toHaveBeenCalledTimes(2);
    expect(fixture.reload).toHaveBeenCalledTimes(1);
  } finally { await watcher.close(); }
});
