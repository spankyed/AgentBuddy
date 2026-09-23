// A plugin's components reach their own plugin through usePlugin(): the host renders each plugin area in a PluginScope,
// and a plugin's component rendered elsewhere (its settings) gets one too. Nothing else hands out plugin actors.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSSRApp, defineComponent, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import type { AnyActorRef } from 'xstate';
import { PluginScope, usePlugin } from '../../src/fe/actor-system.ts';
import { bindFeHost, unbindFeHost } from '../../src/runtime/fe-host.ts';

const memos = { id: 'memos-actor' } as unknown as AnyActorRef;
const notes = { id: 'notes-actor' } as unknown as AnyActorRef;

beforeEach(() => {
  const running: Record<string, AnyActorRef> = { 'memo-pack/memos': memos, 'default-setup/notes': notes };
  bindFeHost({
    application: { system: { get: (ref: string) => running[ref] } } as never,
    secrets: {} as never,
    settings: {} as never,
    client: { send() {} },
    packs: {} as never,
  });
});

afterEach(() => unbindFeHost());

/** A component that renders the id of the plugin actor usePlugin() gave it */
const ShowsPlugin = defineComponent({ setup: () => () => (usePlugin<{ id: string }>()).id });

const render = (root: () => ReturnType<typeof h>) => renderToString(createSSRApp(defineComponent({ setup: () => root })));

describe('usePlugin', () => {
  it('returns the plugin the nearest PluginScope names', async () => {
    const html = await render(() => h('div', [
      h(PluginScope, { plugin: 'memo-pack/memos' }, () => h(ShowsPlugin)),
      h(PluginScope, { plugin: 'memo-pack/memos' }, () => h(PluginScope, { plugin: 'default-setup/notes' }, () => h(ShowsPlugin))),
    ]));
    // Less the SSR fragment markers
    expect(html.replace(/<!--.*?-->/g, '')).toBe('<div>memos-actornotes-actor</div>');
  });

  it('throws outside any plugin', async () => {
    await expect(render(() => h(ShowsPlugin))).rejects.toThrow('usePlugin() runs in a component a plugin renders');
  });
});

describe('PluginScope', () => {
  it('refuses a plugin that is not running, and a name that is not a ref', async () => {
    await expect(render(() => h(PluginScope, { plugin: 'memo-pack/memoz' }, () => h(ShowsPlugin)))).rejects.toThrow('No plugin is running at "memo-pack/memoz"');
    await expect(render(() => h(PluginScope, { plugin: 'memos' }, () => h(ShowsPlugin)))).rejects.toThrow(`"memos" doesn't name a plugin`);
  });
});
