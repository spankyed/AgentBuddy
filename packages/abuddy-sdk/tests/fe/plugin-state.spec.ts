// Reading another plugin's state by ref: the untyped escape hatch beside the typed readers `#generated/fe`
// generates, for code with no PluginScope — an extension component the host renders wherever it belongs. The actor
// comes from the shell's registry, so nothing keeps its own, and the shell's snapshot is what says to look again.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { effectScope, watchSyncEffect, type Ref } from 'vue';
import type { AnyActorRef } from 'xstate';
import { _sendToLocalPlugin, broadcastToPlugin } from '../../src/events/index.ts';
import { readUntypedPluginState, useUntypedPluginState } from '../../src/fe/plugin-state.ts';
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
/** The shell's registry of running plugins, and its snapshot stream: a pack's frontend loading changes both */
let running: Record<string, AnyActorRef>;
let shellChanged: () => void;

beforeEach(() => {
  notes = fakePlugin(['a']);
  running = { 'default-setup/notes': notes.actor };
  const shellListeners = new Set<() => void>();
  shellChanged = () => { for (const fn of [...shellListeners]) fn(); };
  bindFeHost({
    application: {
      system: { get: (ref: string) => running[ref] },
      subscribe: (fn: () => void) => { shellListeners.add(fn); return { unsubscribe: () => shellListeners.delete(fn) }; },
    } as never,
    secrets: {} as never,
    settings: {} as never,
    client: { send() {} },
    packs: {} as never,
  });
});

afterEach(() => unbindFeHost());

const read = (s: Snapshot) => s.context.notes;

describe('useUntypedPluginState', () => {
  it('follows the plugin until the scope is disposed, and unsubscribes with it', () => {
    const scope = effectScope();
    let selected!: Readonly<Ref<string[] | undefined>>;
    scope.run(() => { selected = useUntypedPluginState('default-setup/notes', read); });

    expect(selected.value).toEqual(['a']);
    expect(notes.subscribers).toBe(1);

    notes.change(['a', 'b']);
    expect(selected.value).toEqual(['a', 'b']);

    scope.stop();
    expect(notes.subscribers).toBe(0);
  });

  it('runs only in a reactive scope, so its subscription is always released', () => {
    expect(() => useUntypedPluginState('default-setup/notes', read))
      .toThrow(/runs in a component's setup or an effect scope/);
  });

  // A ref names a plugin; nothing about a name says it is running. Another pack's frontend may still be loading,
  // so absence is a value to render, not a throw — the generated readers narrow it away where the pack ships the
  // plugin itself. A name that isn't a ref is still a mistake, and still throws.
  it('reads a plugin that is not running as undefined, and refuses a name that is not a ref', () => {
    const scope = effectScope();
    expect(scope.run(() => useUntypedPluginState('default-setup/memos', read)?.value)).toBeUndefined();
    expect(readUntypedPluginState('default-setup/memos', read)).toBeUndefined();
    expect(() => scope.run(() => useUntypedPluginState('notes', read)))
      .toThrow(`"notes" doesn't name a plugin`);
    scope.stop();
  });

  // The ref is written only when the selected value changed, so a component reading one field of a busy
  // plugin's context isn't re-rendered every time another field moves.
  it('writes the ref only when the selected value changed', () => {
    const scope = effectScope();
    let writes = 0;
    scope.run(() => {
      const selected = useUntypedPluginState('default-setup/notes', read) as Ref<string[]>;
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
describe('readUntypedPluginState', () => {
  it('takes the value once, outside any scope, and never follows it', () => {
    expect(readUntypedPluginState('default-setup/notes', read)).toEqual(['a']);
    notes.change(['c']);
    expect(readUntypedPluginState('default-setup/notes', read)).toEqual(['c']);
    expect(notes.subscribers).toBe(0);
  });
});

// The renderer half of sending: straight to this window's actor, with no bus between. A backend `broadcastToPlugin`
// reaches every window showing the plugin, which is why the two have different names.
// A read made while another pack's frontend is still loading has nothing to read yet. Resolving the actor once
// left it `undefined` for the life of the scope, which made the cross-pack read — the reason the value is typed
// `T | undefined` at all — useless in exactly the case the type exists for.
describe('following a plugin that is not running yet', () => {
  it('fills in when the plugin arrives, and follows it from then on', () => {
    const scope = effectScope();
    let selected!: Readonly<Ref<string[] | undefined>>;
    scope.run(() => { selected = useUntypedPluginState('memo-pack/memos', read); });
    expect(selected.value).toBeUndefined();

    const memos = fakePlugin(['m1']);
    running['memo-pack/memos'] = memos.actor;
    shellChanged();

    expect(selected.value).toEqual(['m1']);
    memos.change(['m1', 'm2']);
    expect(selected.value).toEqual(['m1', 'm2']);
    scope.stop();
    expect(memos.subscribers).toBe(0);
  });

  it("follows the new actor when a plugin's pack reloads, and drops the old one", () => {
    const scope = effectScope();
    let selected!: Readonly<Ref<string[] | undefined>>;
    scope.run(() => { selected = useUntypedPluginState('default-setup/notes', read); });
    expect(selected.value).toEqual(['a']);

    const reloaded = fakePlugin(['fresh']);
    running['default-setup/notes'] = reloaded.actor;
    shellChanged();

    expect(selected.value).toEqual(['fresh']);
    expect(notes.subscribers).toBe(0);
    reloaded.change(['fresh', 'more']);
    expect(selected.value).toEqual(['fresh', 'more']);
    scope.stop();
  });

  it('reads as undefined again when the plugin goes away', () => {
    const scope = effectScope();
    let selected!: Readonly<Ref<string[] | undefined>>;
    scope.run(() => { selected = useUntypedPluginState('default-setup/notes', read); });
    expect(selected.value).toEqual(['a']);

    delete running['default-setup/notes'];
    shellChanged();

    expect(selected.value).toBeUndefined();
    expect(notes.subscribers).toBe(0);
    scope.stop();
  });

  it('stops listening to the shell when the scope is disposed', () => {
    const scope = effectScope();
    scope.run(() => { useUntypedPluginState('memo-pack/memos', read); });
    scope.stop();

    running['memo-pack/memos'] = fakePlugin(['m1']).actor;
    expect(() => shellChanged()).not.toThrow();
  });
});

describe('_sendToLocalPlugin', () => {
  // It asks the shell rather than the actor: the shell owns whether that plugin is here yet, and answers the same
  // question for `OPEN_PLUGIN`. What it must not do is open the plugin — a send is not a navigation.
  it("asks the shell to hand this window's plugin the event, without opening it", () => {
    const sent: unknown[] = [];
    unbindFeHost();
    bindFeHost({
      application: { send: (event: unknown) => sent.push(event), system: { get: () => undefined } } as never,
      secrets: {} as never,
      settings: {} as never,
      client: { send() {} },
      packs: {} as never,
    });

    _sendToLocalPlugin('default-setup/threads', { type: 'SELECT_ARTIFACT', artifactId: 'a1' });

    expect(sent).toEqual([{ type: 'SEND_TO_PLUGIN', plugin: 'default-setup/threads', events: [{ type: 'SELECT_ARTIFACT', artifactId: 'a1' }] }]);
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

  // A plugin that isn't here yet is the shell's to wait for and, once loading settles, to report through `notify`
  // (`abuddy-host/tests/features/application/fe/open-plugin.spec.ts`). Nothing throws here any more: this half
  // knows only that it asked.
  it('hands the shell a ref no pack provides, rather than throwing on the caller', () => {
    const sent: unknown[] = [];
    unbindFeHost();
    bindFeHost({
      application: { send: (event: unknown) => sent.push(event), system: { get: () => undefined } } as never,
      secrets: {} as never, settings: {} as never, client: { send() {} }, packs: {} as never,
    });

    _sendToLocalPlugin('default-setup/memos', { type: 'X' });

    expect(sent).toEqual([{ type: 'SEND_TO_PLUGIN', plugin: 'default-setup/memos', events: [{ type: 'X' }] }]);
  });
});
