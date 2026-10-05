// Waiting for something to have happened, without asserting how long it takes.
//
// **The number belongs on the failure path.** A spec that sleeps and then asserts puts a guess about duration
// into every passing run, and when the guess is short the failure reads exactly like the bug it was meant to
// catch — "no answer arrived" — which buys an investigation every time it fires. Awaiting the thing instead
// leaves only a deadline, which never runs when the code works, and so can be generous and identical
// everywhere.
//
// **A wait is driven by the thing it waits for, and names what never happened.** Where an event exists, await
// it — that is `_whenSatisfied` and `_byDeadline`. Where none does, a file lock or another process, polling
// with a deadline is right, and `abuddy-host/tests/database/write-lock.spec.ts` is that half done properly. A
// bare duration is never the answer.
//
// The shape here is `startApp`'s own `waitForEmitted` (`abuddy-testing/src/app.ts`) lifted out: a `satisfied()`
// that returns a value or `undefined`, attempted once immediately and again on every event. That one is private
// to the harness's closure, which is the whole reason sixteen sleeps grew up around it — at the point of need a
// sleep was the cheapest thing available.
//
// **Source-only, as `./testing/pack-fixture` and `./testing/serialisation-matrix` are.** The `exports` entry
// names a path under `@abuddy/source` and nothing else, so `publishedManifest` drops it and no pack can resolve
// it. This is repo-internal test support, not something a pack author reaches for.

/**
 * How long a waiter gives up after.
 *
 * **Not an expectation.** It never runs when the code works, so it is deliberately generous and the same
 * everywhere: a per-site number would be a guess about duration again, which is the thing these helpers exist
 * to remove. It is long enough that no plausible machine misses it and short enough to beat a test runner's own
 * timeout, so a failure arrives as a sentence rather than as "test timed out".
 */
export const _WAIT_DEADLINE_MS = 2_000;

/** What a deadline says when it fires: the subject, not just the elapsed time */
const timedOut = (describe: string, deadlineMs: number): Error =>
  new Error(`Timed out after ${deadlineMs}ms waiting for ${describe}`);

/**
 * `promise`, with a deadline that fails naming what never happened.
 *
 * For the case where something will tell you once — an `AbortSignal` firing, a deferred a callback resolves.
 * Without it the same test still fails, by the runner's own timeout, saying only that it took too long.
 */
export function _byDeadline<T>(promise: Promise<T>, describe: string, deadlineMs = _WAIT_DEADLINE_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(timedOut(describe, deadlineMs)), deadlineMs);
    const settle = (finish: () => void) => {
      clearTimeout(timer);
      finish();
    };
    promise.then((value) => settle(() => resolve(value)), (error: unknown) => settle(() => reject(error)));
  });
}

/**
 * What `satisfied()` finds, once an event makes it find something; fails naming what never arrived.
 *
 * For the case where events arrive one at a time and the answer is a property of what has arrived so far —
 * "a `MEMO_ADDED` for this connection", "two answers, one per tag". The predicate reads whatever the caller is
 * already accumulating, which is why this takes `subscribe` rather than the events themselves: the helper stays
 * ignorant of their shape.
 *
 * `satisfied()` is attempted before the first event too, so a condition already met does not wait for one that
 * may never come.
 */
export function _whenSatisfied<T>(
  subscribe: (notify: () => void) => () => void,
  satisfied: () => T | undefined,
  describe: string,
  deadlineMs = _WAIT_DEADLINE_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let stop: (() => void) | undefined;
    let settled = false;
    const end = (finish: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stop?.();
      finish();
    };
    const attempt = () => {
      const found = satisfied();
      if (found !== undefined) end(() => resolve(found));
    };
    const timer = setTimeout(() => end(() => reject(timedOut(describe, deadlineMs))), deadlineMs);
    stop = subscribe(attempt);
    // A subscription that notified synchronously has already finished this, and `stop` was undefined when it
    // did — so unsubscribe now rather than leaving a listener behind
    if (settled) stop();
    else attempt();
  });
}
