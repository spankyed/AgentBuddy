// The loop that restarts the API when its bundle is rebuilt. Two things need cases: the gate, whose
// subject is input and so needs both a firing and a passing side, and the coalescing, whose whole job is
// what happens to a request that arrives at an awkward moment.
import { describe, expect, it, vi } from 'vitest';
import { coalescing, devReloadArmed, DEV_RELOAD_ENV } from '../src/modules/api-server/dev-reloader.ts';

/**
 * **A debug port and a restarting backend belong to a development build and to nothing else.**
 *
 * `development` alone is not the condition: `abuddy dev` resolves to it too, and so does a bare
 * `electron .`, and neither should grow a watcher because someone once ran `npm start`. The launcher's
 * say-so alone is not it either — a stray variable in a shell must not arm a watcher in a packaged app,
 * or a test run, whose API restarting underneath it would be a strange thing to debug.
 */
describe('whether the API-reload watcher is armed', () => {
  const armed = { [DEV_RELOAD_ENV]: '1' };

  it('is armed for a development build the launcher asked', () => {
    expect(devReloadArmed('development', armed)).toBe(true);
  });

  it('is not armed for any other build, however the launcher asked', () => {
    for (const build of ['production', 'beta', 'test']) {
      expect(devReloadArmed(build, armed), `${build} must never watch`).toBe(false);
    }
  });

  /** The case that keeps this to `npm start`: `abuddy dev` is a development build and arms nothing. */
  it('is not armed for a development build nobody asked', () => {
    expect(devReloadArmed('development', {})).toBe(false);
    expect(devReloadArmed('development', { [DEV_RELOAD_ENV]: '' })).toBe(false);
    expect(devReloadArmed('development', { [DEV_RELOAD_ENV]: 'yes' })).toBe(false);
  });
});

/**
 * **A rebuild writes several files, and an edit can land while a reload is running.** Both are ordinary
 * here rather than exotic — the first happens on every build, the second whenever someone saves twice.
 */
describe('coalescing rebuild requests', () => {
  it('turns the several writes of one build into one reload', async () => {
    vi.useFakeTimers();
    const runs: number[] = [];
    const runner = coalescing(async () => { runs.push(1); }, 50);

    runner.request();
    runner.request();
    runner.request();
    await vi.advanceTimersByTimeAsync(80);

    expect(runs.length, 'three writes, one reload').toBe(1);
    vi.useRealTimers();
  });

  /**
   * The one that matters, and the one a busy flag gets wrong: an edit saved *during* a reload must be
   * taken after it. Dropping it leaves the author looking at an app built from the file before the one
   * they saved, with the loop reporting nothing wrong.
   */
  it('takes an edit that arrives while a reload is running', async () => {
    vi.useFakeTimers();
    let running = 0;
    const started: number[] = [];
    let release: (() => void) | undefined;
    const runner = coalescing(async () => {
      started.push(++running);
      await new Promise<void>((resolve) => { release = resolve; });
    }, 50);

    runner.request();
    await vi.advanceTimersByTimeAsync(60);
    expect(started.length, 'the first reload is under way').toBe(1);

    // Saved while it runs, so it cannot start yet
    runner.request();
    await vi.advanceTimersByTimeAsync(60);
    expect(started.length, 'and does not start a second reload alongside').toBe(1);

    release?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(started.length, 'but is taken once the first finishes').toBe(2);
    vi.useRealTimers();
  });

  it('collapses several requests made during one run into a single further run', async () => {
    vi.useFakeTimers();
    const started: number[] = [];
    let release: (() => void) | undefined;
    const runner = coalescing(async () => {
      started.push(started.length + 1);
      await new Promise<void>((resolve) => { release = resolve; });
    }, 50);

    runner.request();
    await vi.advanceTimersByTimeAsync(60);
    runner.request();
    runner.request();
    runner.request();
    await vi.advanceTimersByTimeAsync(60);
    release?.();
    await vi.advanceTimersByTimeAsync(0);
    release?.();
    await vi.advanceTimersByTimeAsync(0);

    expect(started.length, 'one more run, not three').toBe(2);
    vi.useRealTimers();
  });
});
