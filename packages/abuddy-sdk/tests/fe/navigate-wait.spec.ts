// Opening a registered plugin whose actor hasn't spawned yet (a pack's frontend still loading) hands it its events once
// it spawns, and stops waiting if the plugin goes away first (its pack disabled meanwhile).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openPlugin } from '../../src/fe/navigation.ts';
import { resolveName } from '../../src/ids/index.ts';
import { bindFeHost, unbindFeHost } from '../../src/runtime/fe-host.ts';

const memos = resolveName('memo-pack/memos');

/** An application actor whose plugins and spawned actors a test changes, telling its subscribers */
function fakeApplication() {
  const context = { plugins: [{ id: memos }], activePlugin: { id: memos }, defaultToggles: { canvas: false } };
  const actors = new Map<string, { received: unknown[]; send(event: unknown): void }>();
  const listeners = new Set<(snapshot: { context: typeof context }) => void>();
  const notify = () => { for (const listener of [...listeners]) listener({ context }); };
  return {
    listeners,
    spawn(id: string) {
      const actor = { received: [] as unknown[], send(event: unknown) { actor.received.push(event); } };
      actors.set(id, actor);
      notify();
      return actor;
    },
    unregister(id: string) {
      context.plugins = context.plugins.filter((plugin) => plugin.id !== id);
      notify();
    },
    actor: {
      getSnapshot: () => ({ context }),
      send() {},
      system: { get: (id: string) => actors.get(id) },
      subscribe(listener: (snapshot: { context: typeof context }) => void) {
        listeners.add(listener);
        return { unsubscribe: () => listeners.delete(listener) };
      },
    },
  };
}

let app: ReturnType<typeof fakeApplication>;

beforeEach(() => {
  app = fakeApplication();
  bindFeHost({ application: app.actor as never, secrets: {} as never, transport: { sendIncoming() {} }, packs: {} as never });
});

afterEach(() => unbindFeHost());

describe('openPlugin to a plugin not yet spawned', () => {
  it('hands the actor its events once it spawns, then stops listening', () => {
    openPlugin(memos, { type: 'OPEN_MEMO' });
    expect(app.listeners.size).toBe(1);

    const actor = app.spawn(memos);

    expect(actor.received).toEqual([{ type: 'OPEN_MEMO' }]);
    expect(app.listeners.size).toBe(0);
  });

  it('stops waiting when the plugin is unregistered first, and hands nothing on', () => {
    openPlugin(memos, { type: 'OPEN_MEMO' });

    app.unregister(memos);
    expect(app.listeners.size).toBe(0);

    expect(app.spawn(memos).received).toEqual([]);
  });
});
