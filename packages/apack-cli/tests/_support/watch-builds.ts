import { expect, vi } from 'vitest';
import { createPackBuilder } from '../../src/build/build-process.ts';
import { startPackBuildWatcher, type WatchOptions } from '../../src/build/watch.ts';

export type TestPackBuildWatcher = Awaited<ReturnType<typeof startPackBuildWatcher>> & {
  rebuildAfter(edit: () => void): Promise<void>;
};

/** Separate a missing watch request from compilation; callers retain their notification/output checks. */
export async function startTestPackBuildWatcher(root: string, options: Omit<WatchOptions, 'builder'> = {}): Promise<TestPackBuildWatcher> {
  const builder = createPackBuilder(root);
  const build = builder.build.bind(builder);
  const builds: Promise<{ interrupted: boolean; error?: unknown }>[] = [];
  builder.build = input => {
    const deadline = AbortSignal.timeout(builds.length ? 60_000 : 120_000);
    const signal = input?.signal ? AbortSignal.any([input.signal, deadline]) : deadline;
    const running = build({ ...input, signal });
    builds.push(running.then(() => ({ interrupted: false }), error => ({ interrupted: signal.aborted, error })));
    return running;
  };
  try {
    const watcher = await startPackBuildWatcher(root, { ...options, builder });
    const done = watcher.done.finally(() => builder.close());
    void done.catch(() => {});
    return {
      done,
      async close() {
        try { await watcher.close(); }
        finally { await done; }
      },
      async rebuildAfter(edit) {
        const before = builds.length;
        edit();
        await vi.waitFor(() => expect(builds.length, 'watch request did not start a rebuild').toBeGreaterThan(before), { timeout: 20_000 });
        const result = await builds[before]!;
        if (result.interrupted) throw result.error;
      },
    };
  } catch (error) {
    await builder.close();
    throw error;
  }
}
