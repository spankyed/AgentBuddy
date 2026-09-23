// Reading another plugin's state by ref: what extension components and a feature's fe/public.ts use, where
// usePlugin() has no PluginScope to read. The actor comes from the shell's registry, so nothing keeps its own.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { effectScope, type Ref } from 'vue';
import type { AnyActorRef } from 'xstate';
import { readPluginState, usePluginState } from '../../src/fe/plugin-state.ts';
import { bindFeHost, unbindFeHost } from '../../src/runtime/fe-host.ts';

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
});

describe('readPluginState', () => {
  it('takes the value once, outside any scope, and never follows it', () => {
    expect(readPluginState('default-setup/notes', read)).toEqual(['a']);
    notes.change(['c']);
    expect(readPluginState('default-setup/notes', read)).toEqual(['c']);
    expect(notes.subscribers).toBe(0);
  });
});
