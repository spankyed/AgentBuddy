// The pack's frontend on the app's own shell (startShell): opening its plugin by name, the shell's state as useShell()
// reads it, and the plugin reaching its system and hearing back over the harness's bus, with no app launched.
import { effectScope } from 'vue';
import { expect, it } from 'vitest';
import { startApp, startShell } from '@abuddy/testing/harness';
import { useShell } from '@abuddy/sdk/fe';
import { navigateToPlugin } from '#generated/fe';
import { sendToPlugin } from '#generated/events';
import memosState from '../../src/features/memos/fe/state';
import notesState from '../../src/features/notes/fe/state';

const memo = { id: 'memo-1', text: 'handed over on opening', createdAt: 1 };

it('opens its plugin by name, hands it the events, and the shell reads it as open', async () => {
  const shell = await startShell({ plugins: { notes: { state: notesState }, memos: { state: memosState } } });
  const scope = effectScope();
  const state = scope.run(() => useShell())!;
  expect(shell.opened()).toBe('e2e-fixture/notes');

  navigateToPlugin('memos', { type: 'MEMOS_CONNECTED', memos: [memo] });

  expect(shell.opened()).toBe('e2e-fixture/memos');
  expect(state.activePlugin.value.id).toBe('e2e-fixture/memos');
  expect(shell.plugin('memos').getSnapshot().context.memos).toEqual([memo]);
  expect(shell.notices).toEqual([]);
  scope.stop();
});

// `sendToPlugin` is the renderer's half: it reaches this window's actor directly, without opening the plugin.
// What it may carry is the inbox `fe/plugin.ts` declares with `pluginAccepts()` — this is the only place an
// external pack's declared inbox is exercised, the app's own packs being built by the same codegen.
it('sends a declared event to a plugin in this window without opening it', async () => {
  const shell = await startShell({ plugins: { notes: { state: notesState }, memos: { state: memosState } } });
  expect(shell.opened()).toBe('e2e-fixture/notes');

  sendToPlugin('memos', { type: 'MEMO.HIGHLIGHT', memoId: memo.id });

  expect(shell.plugin('memos').getSnapshot().context.highlighted).toBe(memo.id);
  // still where it was: this send delivers, it doesn't navigate
  expect(shell.opened()).toBe('e2e-fixture/notes');
  expect(shell.notices).toEqual([]);
});

it('tells the user about a plugin no pack provides, once loading has settled', async () => {
  const shell = await startShell({ plugins: { memos: { state: memosState } } });

  navigateToPlugin('default-setup/logs');

  expect(shell.opened()).toBe('e2e-fixture/memos');
  expect(shell.notices).toEqual([{ title: "Couldn't open default-setup/logs", detail: 'No plugin is registered at "default-setup/logs"' }]);
});

it("reaches its system and hears back over the harness's bus", async () => {
  const app = await startApp({ systems: ['memos'] });
  await app.connect();
  const shell = await startShell({ plugins: { memos: { state: memosState } } });

  shell.plugin('memos').send({ type: 'MEMOS.ADD', text: 'added from the plugin' });
  await app.settle();

  expect(shell.plugin('memos').getSnapshot().context.memos.map((m: { text: string }) => m.text)).toContain('added from the plugin');
});

it('refuses a second frontend host in one test, naming what to do', async () => {
  await startShell({ plugins: { memos: { state: memosState } } });

  await expect(startShell({ plugins: { memos: { state: memosState } } })).rejects.toThrow('startShell() binds its own');
});
