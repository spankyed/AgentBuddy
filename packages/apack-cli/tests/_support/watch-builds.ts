import { expect, vi } from 'vitest';
import { createPackBuilder } from '../../src/build/build-process.ts';
import { startPackBuildWatcher, type WatchOptions } from '../../src/build/watch.ts';

const REQUEST_TIMEOUT_MS = 20_000;
const BUILD_TIMEOUT_MS = 60_000;
/** Request, compilation and the caller's existing 20s notification check. */
export const WATCH_REBUILD_BUDGET_MS = REQUEST_TIMEOUT_MS + BUILD_TIMEOUT_MS + 20_000;

export type TestPackBuildWatcher = Awaited<ReturnType<typeof startPackBuildWatcher>> & {
  rebuildAfter(edit: () => void): Promise<void>;
};

/** Separate a missing watch request from compilation; callers retain their notification/output checks. */
export async function startTestPackBuildWatcher(root: string, options: Omit<WatchOptions, 'builder'> = {}): Promise<TestPackBuildWatcher> {
  const builder = createPackBuilder(root);
  const build = builder.build.bind(builder);
  const builds: Promise<{ interrupted: boolean; error?: unknown }>[] = [];
  builder.build = input => {
    const index = builds.length;
    const started = Date.now();
    const trace = (phase: string, detail: object = {}) => console.log(JSON.stringify({ publicationProof: phase, at: Date.now(), root, index, ...detail }));
    trace('request');
    // Diagnostic only: observe up to 120s, retaining failure of the original 60s rebuild allowance.
    const originalLimit = index ? BUILD_TIMEOUT_MS : 120_000;
    const boundary = setTimeout(() => trace('original-deadline', { originalLimit }), originalLimit);
    const deadline = AbortSignal.timeout(120_000);
    const signal = input?.signal ? AbortSignal.any([input.signal, deadline]) : deadline;
    const running = build({ ...input, signal });
    builds.push(running.then(() => {
      const elapsed = Date.now() - started;
      trace('complete', { elapsed });
      return elapsed >= originalLimit
        ? { interrupted: true, error: new Error(`Observed build ${index} exceeded its original ${originalLimit}ms allowance (${elapsed}ms)`) }
        : { interrupted: false };
    }, error => {
      trace('refused', { elapsed: Date.now() - started, error: String(error), aborted: signal.aborted });
      return { interrupted: signal.aborted, error };
    }).finally(() => clearTimeout(boundary)));
    return running;
  };
  try {
    const watcher = await startPackBuildWatcher(root, { ...options, builder });
    const done = watcher.done.finally(() => builder.close());
    void done.catch(() => {});
    let closing: Promise<void> | undefined;
    return {
      done,
      close() {
        return closing ??= (async () => {
          let result: PromiseSettledResult<void> | undefined;
          void watcher.close().finally(() => done).then(
            value => { result = { status: 'fulfilled', value }; },
            reason => { result = { status: 'rejected', reason }; },
          );
          await vi.waitFor(() => expect(result, 'watcher cleanup did not settle').toBeDefined(), { timeout: 20_000 });
          if (result?.status === 'rejected') throw result.reason;
        })();
      },
      async rebuildAfter(edit) {
        const before = builds.length;
        edit();
        await vi.waitFor(() => expect(builds.length, 'watch request did not start a rebuild').toBeGreaterThan(before), { timeout: REQUEST_TIMEOUT_MS });
        const result = await builds[before]!;
        if (result.interrupted) throw result.error;
      },
    };
  } catch (error) {
    await builder.close();
    throw error;
  }
}
