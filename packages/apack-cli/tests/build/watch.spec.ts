import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { coalescingRunner } from '../../src/build/watch.ts';

/**
 * What the backend watch loop owes an author: every save reaches a rebuild, and a burst of them costs one.
 *
 * **Nothing here waits for anything.** Time is faked, so the debounce is the production constant rather than
 * a shorter one the test picked, and a run finishes when the test says so. `settle()` is the only
 * asynchrony: it hands the loop its continuations and returns, so each assertion is about a state the
 * scheduler has already reached. A `vi.waitFor` here would poll real time against fake timers, which is how
 * a scheduling test starts failing on a busy machine for reasons that have nothing to do with scheduling.
 */
const DEBOUNCE_MS = 300;

/** Hands over every microtask and due timer, so the loop is wherever it was going to be */
const settle = () => vi.advanceTimersByTimeAsync(0);

/** A run the test finishes when it chooses, counting how many times it was entered */
function heldRun() {
  const state = { entered: 0, finish: () => {} };
  return {
    state,
    run: () => {
      state.entered++;
      return new Promise<void>((resolve) => { state.finish = resolve; });
    },
  };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('the watch loop', () => {
  it('coalesces a burst of edits into one run', async () => {
    const { state, run } = heldRun();
    const runs = coalescingRunner(run, DEBOUNCE_MS);

    runs.request();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 1);
    runs.request();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 1);
    runs.request();
    expect(state.entered, 'nothing yet: the edits have not stopped').toBe(0);

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(state.entered).toBe(1);
  });

  /**
   * The firing case. A save landing while a bundle is in flight used to hit a `return` on the busy flag and
   * be lost, leaving the author's app built from the file before the one they just saved — with the loop
   * reporting success for the build that did run.
   */
  it('takes an edit that arrives mid-run, after that run', async () => {
    const { state, run } = heldRun();
    const runs = coalescingRunner(run, DEBOUNCE_MS);

    runs.request();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(state.entered).toBe(1);

    // The edit, while the first run is still going
    runs.request();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(state.entered, 'still one: the run in flight has it').toBe(1);

    state.finish();
    await settle();
    expect(state.entered).toBe(2);
  });

  it('collapses several mid-run edits into one further run, not a queue of them', async () => {
    const { state, run } = heldRun();
    const runs = coalescingRunner(run, DEBOUNCE_MS);

    runs.request();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(state.entered).toBe(1);

    for (let i = 0; i < 3; i++) {
      runs.request();
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    }
    state.finish();
    await settle();
    expect(state.entered).toBe(2);

    // And that second run is the last: three edits asked for one more run, not three
    state.finish();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    expect(state.entered).toBe(2);
  });

  // A failed run reports and returns rather than throwing, so the request made while it was failing is the
  // author fixing the error — it must still be taken
  it('takes a pending edit after a run that failed', async () => {
    const { state, run } = heldRun();
    const runs = coalescingRunner(run, DEBOUNCE_MS);

    runs.request();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    runs.request();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    state.finish();
    await settle();

    expect(state.entered).toBe(2);
  });
});
