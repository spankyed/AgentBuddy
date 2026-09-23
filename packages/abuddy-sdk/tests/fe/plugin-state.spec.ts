// Reading another plugin's state by ref: what extension components and a feature's fe/public.ts use, where
// usePlugin() has no PluginScope to read. The actor comes from the shell's registry, so nothing keeps its own.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { effectScope, watchSyncEffect, type Ref } from 'vue';
import type { AnyActorRef } from 'xstate';
import { _sendToLocalPlugin, broadcastToPlugin } from '../../src/events/index.ts';
import { readPluginState, usePluginState } from '../../src/fe/plugin-state.ts';
import { bindFeHost, unbindFeHost } from '../../src/runtime/fe-host.ts';
import { bindHost, unbindHost } from '../../src/runtime/host-runtime.ts';

type Snapshot = { context: { notes: string[] } };

/** A plugin actor as the shell's registry holds one: a snapshot, and subscribers told when it changes */
function fakePlugin(notes: string[]) {
  const listeners = new Set<(snapshot: Snapshot) => void>();
  let snapshot: Snapshot = { context: { notes } };
  return {
    actor: {
      getSnapshot: () => snapshot,
      subscribe: (fn: (snapshot: Snapshot) => void) => {
        listeners.add(fn);
        return { unsubscribe: () => listeners.delete(fn) };
      },
    } as unknown as AnyActorRef,
    change(next: string[]) {
      snapshot = { context: { notes: next } };
      for (const fn of listeners) fn(snapshot);
    },
    get subscribers() { return listeners.size; },
  };
}

let notes: ReturnType<typeof fakePlugin>;

beforeEach(() => {
  notes = fakePlugin(['a']);
  const running: Record<string, AnyActorRef> = { 'default-setup/notes': notes.actor };
  bindFeHost({
    application: { system: { get: (ref: string) => running[ref] } } as never,
    secrets: {} as never,
    settings: {} as never,
    client: { send() {} },
    packs: {} as never,
  });
});

afterEach(() => unbindFeHost());

const read = (s: Snapshot) => s.context.notes;

describe('usePluginState', () => {
  it('follows the plugin until the scope is disposed, and unsubscribes with it', () => {
    const scope = effectScope();
    let selected!: Readonly<Ref<string[]>>;
    scope.run(() => { selected = usePluginState('default-setup/notes', read); });

    expect(selected.value).toEqual(['a']);
    expect(notes.subscribers).toBe(1);

    notes.change(['a', 'b']);
    expect(selected.value).toEqual(['a', 'b']);

    scope.stop();
    expect(notes.subscribers).toBe(0);
  });

  it('runs only in a reactive scope, so its subscription is always released', () => {
    expect(() => usePluginState('default-setup/notes', read))
      .toThrow(/runs in a component's setup or an effect scope/);
  });

  it('refuses a plugin that is not running, and a name that is not a ref', () => {
    const scope = effectScope();
    expect(() => scope.run(() => usePluginState('default-setup/memos', read)))
      .toThrow('No plugin is running at "default-setup/memos"');
    expect(() => scope.run(() => usePluginState('notes', read)))
      .toThrow(`"notes" doesn't name a plugin`);
    scope.stop();
  });

  // The ref is written only when the selected value changed, so a component reading one field of a busy
  // plugin's context isn't re-rendered every time another field moves.
  it('writes the ref only when the selected value changed', () => {
    const scope = effectScope();
    let writes = 0;
    scope.run(() => {
      const selected = usePluginState('default-setup/notes', read) as Ref<string[]>;
      // A dependency on the ref, counted each time it is written
      const stop = watchSyncEffect(() => { void selected.value; writes += 1; });
      expect(writes).toBe(1);
      const same = selected.value;
      notes.change(same);        // a new snapshot, the same selected value
      expect(writes).toBe(1);
      notes.change(['a', 'b']);  // a changed value
      expect(writes).toBe(2);
      stop();
    });
    scope.stop();
  });
});
describe('readPluginState', () => {
  it('takes the value once, outside any scope, and never follows it', () => {
    expect(readPluginState('default-setup/notes', read)).toEqual(['a']);
    notes.change(['c']);
    expect(readPluginState('default-setup/notes', read)).toEqual(['c']);
    expect(notes.subscribers).toBe(0);
  });
});

// The renderer half of sending: straight to this window's actor, with no bus between. A backend `broadcastToPlugin`
// reaches every window showing the plugin, which is why the two have different names.
describe('_sendToLocalPlugin', () => {
  it("delivers to this window's actor for that plugin", () => {
    const sent: unknown[] = [];
    unbindFeHost();
    bindFeHost({
      application: { system: { get: () => ({ send: (event: unknown) => sent.push(event) }) } } as never,
      secrets: {} as never,
      settings: {} as never,
      client: { send() {} },
      packs: {} as never,
    });

    _sendToLocalPlugin('default-setup/threads', { type: 'SELECT_ARTIFACT', artifactId: 'a1' });

    expect(sent).toEqual([{ type: 'SELECT_ARTIFACT', artifactId: 'a1' }]);
  });

  // The two sends share a signature, so picking the wrong one compiles. Worse, a pack test that starts both an
  // app and a shell binds both hosts, where the wrong one would work — so each says which it is by name.
  it('says which send it is when only the other half is bound', () => {
    unbindFeHost();
    expect(() => _sendToLocalPlugin('default-setup/notes', { type: 'X' }))
      .toThrow(/No frontend host is bound/);

    bindHost({ transport: { rootEvents: { emitPluginSend() {} } } } as never);
    try {
      expect(() => _sendToLocalPlugin('default-setup/notes', { type: 'X' }))
        .toThrow(/sendToPlugin.*is the renderer's.*broadcastToPlugin/s);
    } finally {
      unbindHost();
    }
  });

  it("says broadcastToPlugin is the backend's when only a window is bound", () => {
    expect(() => broadcastToPlugin('default-setup/notes', { type: 'X' }))
      .toThrow(/broadcastToPlugin.*is the backend's.*sendToPlugin/s);
  });

  it('says which plugin is not running, rather than dropping the event', () => {
    expect(() => _sendToLocalPlugin('default-setup/memos', { type: 'X' }))
      .toThrow('No plugin is running at "default-setup/memos" to send X to');
  });
});
