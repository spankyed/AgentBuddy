// The order a dev session lets go of what it holds, which is load-bearing and had nothing driving it.
//
// Two of the four steps are ordered for a reason a reader cannot infer from the code: a record goes before
// the thing it describes, and the throwaway data dir goes after the app has actually exited rather than
// after it has been asked to. Both are asserted here as an order, so a step moved out of place fails rather
// than being discovered on Windows.
import { describe, expect, it, vi } from 'vitest';
import { createDevHold } from '../../src/app/dev-hold.ts';
import type { ChildProcess } from 'node:child_process';

/** A hold over a recorder, with every resource held so the order is the whole answer */
function held(options: { app?: boolean; profile?: boolean } = {}) {
  const { app = true, profile = true } = options;
  const order: string[] = [];
  const fakeApp = { kill: () => order.push('app.kill') } as unknown as ChildProcess;
  const hold = createDevHold({
    removeMarker: packId => order.push(`marker.remove:${packId}`),
    ...(profile ? { removeProfile: () => order.push('profile.remove') } : {}),
    awaitExit: () => {
      order.push('app.exited');
      return Promise.resolve();
    },
  });
  hold.holdsMarker('memos');
  hold.holdsSession(() => order.push('session.unpublish'));
  hold.holdsServer({ close: () => order.push('server.close') });
  if (app) hold.holdsApp(fakeApp);
  return { hold, order };
}

describe('what a dev session holds', () => {
  it('lets go of the records, then the server, then the app, and only then the data dir', async () => {
    const { hold, order } = held();
    await hold.release();
    expect(order).toEqual([
      'marker.remove:memos', 'session.unpublish', 'server.close', 'app.kill', 'app.exited', 'profile.remove',
    ]);
  });

  it('stops before the data dir when all it can do is synchronous', () => {
    const { hold, order } = held();
    hold.releaseNow();
    // The app is asked to go; nothing waits for it and nothing is removed from under it
    expect(order).toEqual(['marker.remove:memos', 'session.unpublish', 'server.close', 'app.kill']);
  });

  // `release` ends by exiting the process, which fires the `exit` handler that calls `releaseNow`
  it('does nothing a second time, in either order', async () => {
    const { hold, order } = held();
    await hold.release();
    const after = order.length;
    hold.releaseNow();
    await hold.release();
    expect(order).toHaveLength(after);
  });

  it('closes no app and waits for none when the one it started was refused the data dir', async () => {
    const { hold, order } = held();
    hold.forgetApp();
    await hold.release();
    expect(order.filter(step => step.startsWith('app.'))).toEqual([]);
    // The data dir still goes: there is nothing left holding its files
    expect(order).toContain('profile.remove');
  });

  it('releases only what it was given', async () => {
    const { hold, order } = held({ app: false, profile: false });
    await hold.release();
    expect(order).toEqual(['marker.remove:memos', 'session.unpublish', 'server.close']);
  });
});

it('concurrent shutdown callers wait until the app exits and profile cleanup completes', async () => {
  let finish!: () => void;
  let removed = false;
  const hold = createDevHold({
    removeMarker: () => {},
    awaitExit: () => new Promise<void>(resolve => { finish = resolve; }),
    removeProfile: () => { removed = true; },
  });
  hold.holdsApp({ kill: () => {} } as unknown as ChildProcess);
  const signal = hold.release();
  const childExit = hold.release();
  expect(childExit).toBe(signal);
  await Promise.resolve();
  expect(removed).toBe(false);
  finish();
  await Promise.all([signal, childExit]);
  expect(removed).toBe(true);
});


it('closes the watcher before app teardown and closes a late watcher immediately', async () => {
  const { hold, order } = held();
  hold.holdsWatcher(() => { order.push('watcher.close'); });
  await hold.release();
  expect(order[0]).toBe('watcher.close');
  expect(order.indexOf('watcher.close')).toBeLessThan(order.indexOf('app.kill'));
  const late = vi.fn();
  hold.holdsWatcher(late);
  expect(late).toHaveBeenCalledOnce();
});


it('waits for an in-flight watcher operation before removing the profile', async () => {
  const { hold, order } = held();
  let finish!: () => void;
  hold.holdsWatcher(() => new Promise<void>(resolve => { finish = resolve; }));
  const released = hold.release();
  await Promise.resolve();
  expect(order).toContain('app.kill');
  expect(order).not.toContain('profile.remove');
  finish();
  await released;
  expect(order.at(-1)).toBe('profile.remove');
});
