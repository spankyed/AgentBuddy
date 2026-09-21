// The window opens on the plugin it last showed, which it keeps in localStorage. Before 0.3.15 that was a bare
// plugin id no plugin runs under any more: it is dropped, and the window opens on its first plugin. An address
// stays even when no plugin has it yet, since an external pack's plugins register after the window opens.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createActor, setup, type Actor } from 'xstate';
import type { Plugin } from '@/core/types';

vi.mock('@/core/trpc', () => ({
  trpc: {
    bus: { sub: { subscribe: () => ({ unsubscribe: () => {} }) } },
    packs: { loaded: { query: () => Promise.resolve([]) } },
  },
}));

const { createApplicationState } = await import('@/core/actors/application');

const KEY = 'agentbuddy-last-active-plugin';

function plugin(id: string): Plugin {
  return { id, label: id, icon: 'Zap', state: setup({}).createMachine({}), canvas: {} } as unknown as Plugin;
}

const notes = plugin('default-setup/notes');
const threads = plugin('default-setup/threads');
let app: Actor<ReturnType<typeof createApplicationState>> | undefined;

const open = () => {
  app = createActor(createApplicationState(), {
    systemId: 'host/application',
    input: { plugins: [notes, threads], defaultPlugin: notes, restoreLastActivePlugin: false },
  }).start();
  return app.getSnapshot().context.activePlugin.id;
};

beforeEach(() => localStorage.clear());
afterEach(() => app?.stop());

it('opens on the plugin it last showed', () => {
  localStorage.setItem(KEY, 'default-setup/threads');
  expect(open()).toBe('default-setup/threads');
  expect(localStorage.getItem(KEY)).toBe('default-setup/threads');
});

it('drops a plugin id from before plugins were addressed', () => {
  localStorage.setItem(KEY, 'threads');
  expect(open()).toBe('default-setup/notes');
  expect(localStorage.getItem(KEY)).toBeNull();
});

it("keeps an address no plugin has yet: its pack's frontend hasn't loaded", () => {
  localStorage.setItem(KEY, 'memo-pack/memos');
  expect(open()).toBe('default-setup/notes');
  expect(localStorage.getItem(KEY)).toBe('memo-pack/memos');
});
