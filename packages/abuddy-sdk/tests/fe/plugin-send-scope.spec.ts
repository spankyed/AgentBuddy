// A component's send says which plugin made it.
//
// This is the one path that reaches a machine's actions from outside a delivery. The bus names the message it
// routes to a system and the shell names the one it hands a plugin, but a click goes straight to the actor — so
// an action that then sent to a system stamped no `Message.sender`, and the system answering it with `reply` had
// no address and threw. For the commonest kind of request in the app.
//
// What the scope is read for is `Message.sender` (`createSends` in `events/index.ts`); here it is read directly,
// because what this file is about is whether the scope is set at all.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSSRApp, defineComponent, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import type { AnyActorRef } from 'xstate';
import { PluginScope, usePlugin } from '../../src/fe/actor-system.ts';
import { _currentDelivery, type _Delivery } from '../../src/events/delivery.ts';
import { bindFeHost, unbindFeHost } from '../../src/runtime/fe-host.ts';

/** What the delivery scope held each time the actor was sent to */
let scopes: (_Delivery | undefined)[] = [];

/** A plugin actor that records the scope its send ran in, which is the whole subject */
const recording = (id: string) => ({
  id,
  send: () => { scopes.push(_currentDelivery()); },
}) as unknown as AnyActorRef;

beforeEach(() => {
  scopes = [];
  const running: Record<string, AnyActorRef> = {
    'memo-pack/memos': recording('memo-pack/memos'),
    'default-setup/notes': recording('default-setup/notes'),
  };
  bindFeHost({
    application: { system: { get: (ref: string) => running[ref] } } as never,
    secrets: {} as never,
    settings: {} as never,
    client: { send() {} },
    packs: {} as never,
  });
});

afterEach(() => unbindFeHost());

/** A component that does what a click handler does: send to its own plugin */
const Sends = defineComponent({
  setup: () => {
    usePlugin<AnyActorRef>().send({ type: 'FETCH' } as never);
    return () => '';
  },
});

const render = (root: () => ReturnType<typeof h>) => renderToString(createSSRApp(defineComponent({ setup: () => root })));

describe("a component's send", () => {
  it('runs in a delivery naming its own plugin', async () => {
    await render(() => h(PluginScope, { plugin: 'memo-pack/memos' }, () => h(Sends)));

    expect(scopes).toHaveLength(1);
    expect(scopes[0]?.receiver, 'so an answer can come back to this plugin').toBe('memo-pack/memos');
  });

  // Two plugins' components in one render: each send must name its own, not whichever rendered last
  it('names the plugin whose component sent it', async () => {
    await render(() => h('div', [
      h(PluginScope, { plugin: 'memo-pack/memos' }, () => h(Sends)),
      h(PluginScope, { plugin: 'default-setup/notes' }, () => h(Sends)),
    ]));

    expect(scopes.map((scope) => scope?.receiver)).toEqual(['memo-pack/memos', 'default-setup/notes']);
  });

  /**
   * The scope is for the send and no longer: a component that sends and then does other work must not leave one
   * in place, or whatever ran next would answer the wrong asker.
   */
  it('leaves no scope behind once the send has returned', async () => {
    await render(() => h(PluginScope, { plugin: 'memo-pack/memos' }, () => h(Sends)));

    expect(_currentDelivery(), 'nothing is being handled out here').toBeUndefined();
  });

  // The wrapper is per actor, so a component calling usePlugin() twice compares equal either way
  it('hands back the same object each time', async () => {
    let first: unknown;
    let second: unknown;
    const Twice = defineComponent({
      setup: () => {
        first = usePlugin<AnyActorRef>();
        second = usePlugin<AnyActorRef>();
        return () => '';
      },
    });

    await render(() => h(PluginScope, { plugin: 'memo-pack/memos' }, () => h(Twice)));

    expect(first).toBe(second);
  });
});
