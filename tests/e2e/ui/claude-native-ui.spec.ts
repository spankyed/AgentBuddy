import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect } from '@apackdev/testing';

const workspace = process.env.CLAUDE_RESEARCH_WORKSPACE;
const launcher = process.env.CLAUDE_RESEARCH_LAUNCHER;
const endpoint = process.env.CLAUDE_RESEARCH_MODEL_URL;

test.skip(!workspace || !launcher || !endpoint, 'Explicit private native research fixture required');

test('native composer controls redraw without submitting typed input or starting another process', async ({ app, appPage }, testInfo) => {
  expect(process.env.HOME).toBe(workspace);
  expect(new URL(endpoint!).hostname).toBe('127.0.0.1');
  for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN']) expect(process.env[key]).toBeUndefined();
  const errors: string[] = [];
  appPage.on('pageerror', error => errors.push(error.message));
  await app.waitForPlugin('default-setup/threads');
  await app.navigate('default-setup/threads');
  // Wait for the fresh profile's asynchronous onboarding thread to finish opening before selecting our new thread.
  await expect.poll(() => appPage.evaluate(() => (window as any).applicationState.system.get('default-setup/threads').getSnapshot().context.currentThread?.forcedMode)).toBe('Birth');
  await app.navigate('host/settings');
  await appPage.evaluate(() => {
    const settings = (window as any).applicationState.system.get('host/settings');
    settings.send({ type: 'TAB.SELECT', tab: 'general' });
    settings.send({ type: 'GENERAL_NAV.SELECT', item: 'secrets' });
  });
  const provider = appPage.getByText('Claude Code CLI', { exact: true }).locator('..').locator('..').locator('..');
  await provider.getByPlaceholder('Path override (auto-detected if empty)').fill(launcher!);
  // The form debounces persistence for 600ms. Remount it to check the committed read view.
  await appPage.waitForTimeout(700);
  await app.navigate('default-setup/threads');
  await app.navigate('host/settings');
  await expect(provider.getByPlaceholder('Path override (auto-detected if empty)')).toHaveValue(launcher!);
  await app.navigate('default-setup/threads');
  await appPage.evaluate(cwd => {
    const threads = (window as any).applicationState.system.get('default-setup/threads');
    threads.send({ type: 'NEW_THREAD_IN_PROJECT', directory: cwd });
    threads.send({ type: 'VIEW_DASHBOARD' });
    threads.send({ type: 'SET_MODE', mode: 'Claude Code' });
  }, workspace!);
  await expect.poll(() => appPage.evaluate(() => (window as any).applicationState.system.get('default-setup/threads').getSnapshot().context.mode)).toBe('Claude Code');
  const card = appPage.locator('[data-onboarding-id="agent-chat-input"]');
  await expect(card).toBeVisible();
  const editor = card.locator('[contenteditable="true"]');
  await editor.fill('Synthetic native composer fixture');
  await card.getByRole('button', { name: 'Send', exact: true }).click();
  const strip = card.getByTestId('composer-session-strip');
  await expect(strip.getByText('Synthetic apack UI count: 0', { exact: true })).toBeVisible({ timeout: 20000 });
  const snapshot = () => appPage.evaluate(() => {
    const ctx = (window as any).applicationState.system.get('default-setup/threads').getSnapshot().context;
    return { threadId: ctx.currentThread?.id, messages: ctx.currentThread?.messages.length, turns: ctx.currentThread?.context?.claudeCode?.turns };
  });
  await expect.poll(async () => (await snapshot()).turns).toBe(1);
  const first = await snapshot();
  const nativeAction = () => appPage.evaluate(() => {
    const ctx = (window as any).applicationState.system.get('default-setup/threads').getSnapshot().context;
    const entry = Object.entries(ctx.nativeUiViews).find(([, value]: any) => value.threadId === ctx.currentThread?.id && value.state.status === 'live');
    if (!entry) throw new Error('No owned native drawing');
    const findButton = (node: any): string | undefined => node.kind === 'button' ? node.actionId : node.kind === 'box' ? node.children.map(findButton).find(Boolean) : undefined;
    return { threadId: ctx.currentThread.id, mountId: entry[0], actionId: findButton((entry[1] as any).state.tree) };
  });
  const oldAction = await nativeAction();
  expect(oldAction.actionId).toBeTruthy();
  await editor.fill('Unsent text stays here');
  await strip.getByRole('button', { name: 'Run fixture', exact: true }).click();
  await expect(strip.getByText('Synthetic apack UI count: 1', { exact: true })).toBeVisible();
  await expect(editor).toHaveText('Unsent text stays here');
  expect(await snapshot()).toEqual(first);
  expect(await readFile(join(workspace!, 'pressed.txt'), 'utf8')).toBe('1');
  expect(await strip.getByRole('button').evaluateAll(buttons => buttons.every(button => (button as HTMLButtonElement).type === 'button'))).toBe(true);
  const freshAction = await nativeAction();
  expect(freshAction.actionId).toBeTruthy();
  expect(freshAction.actionId).not.toBe(oldAction.actionId);
  await appPage.evaluate(({ oldAction, freshAction }) => {
    const send = (window as any).__sendToSystem;
    send('default-setup/threads', { type: 'CLAUDE_UI_PRESS', ...oldAction });
    send('default-setup/threads', { type: 'CLAUDE_UI_PRESS', ...freshAction, threadId: 'foreign-research-thread' });
    send('default-setup/threads', { type: 'CLAUDE_UI_PRESS', ...freshAction, mountId: '00000000-0000-4000-8000-000000000000' });
  }, { oldAction, freshAction });
  // A subsequent real press crosses the same delivery channel and supplies an observable barrier.
  await strip.getByRole('button', { name: 'Run fixture', exact: true }).click();
  await expect(strip.getByText('Synthetic apack UI count: 2', { exact: true })).toBeVisible();
  expect(await readFile(join(workspace!, 'pressed.txt'), 'utf8')).toBe('2');
  await expect(editor).toHaveText('Unsent text stays here');
  expect(await snapshot()).toEqual(first);
  await appPage.screenshot({ path: testInfo.outputPath('native-composer-wide.png') });
  await appPage.setViewportSize({ width: 680, height: 900 });
  await expect(strip.getByRole('button', { name: 'Run fixture', exact: true })).toBeVisible();
  const geometry = await strip.evaluate(element => ({ width: element.clientWidth, scroll: element.scrollWidth }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
  await appPage.screenshot({ path: testInfo.outputPath('native-composer-narrow.png') });
  await appPage.setViewportSize({ width: 1400, height: 900 });
  // A rendered send must reach the same retained native owner after an idle UI press.
  await editor.fill('Synthetic second host input');
  await card.getByRole('button', { name: 'Send', exact: true }).click();
  await expect.poll(async () => (await snapshot()).turns).toBe(2);
  expect((await snapshot()).threadId).toBe(first.threadId);
  const launches = (await readFile(join(workspace!, 'native-launches.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  expect(launches.filter(value => value.args.includes('--input-format'))).toHaveLength(1);
  // Switching views detaches the UI without stopping the retained native conversation.
  await appPage.evaluate(() => (window as any).applicationState.system.get('default-setup/threads').send({ type: 'CLEAR_THREAD' }));
  await expect(card.getByRole('button', { name: 'Run fixture', exact: true })).toHaveCount(0);
  await appPage.evaluate(threadId => (window as any).applicationState.system.get('default-setup/threads').send({ type: 'OPEN_THREAD_CHAT', threadId }), first.threadId);
  await expect(strip.getByText('Synthetic apack UI count: 2', { exact: true })).toBeVisible();
  const beforeOversize = await snapshot();
  await editor.fill('Unsent text survives oversized native output');
  await strip.getByRole('button', { name: 'Oversize fixture', exact: true }).click();
  const fallback = strip.getByRole('status');
  await expect(fallback).toHaveText('Claude controls unavailable').catch(async error => {
    await writeFile(join(workspace!, 'oversize-state.json'), JSON.stringify(await appPage.evaluate(() => {
      const ctx = (window as any).applicationState.system.get('default-setup/threads').getSnapshot().context;
      const summary = (node: any): any => node?.kind === 'box' ? { kind: node.kind, children: node.children.map(summary) } : { kind: node?.kind, textLength: node?.text?.length, label: node?.label };
      return Object.fromEntries(Object.entries(ctx.nativeUiViews).map(([key, value]: any) => [key, { threadId: value.threadId, status: value.state.status, message: value.state.message, tree: summary(value.state.tree) }]));
    }), null, 2));
    await appPage.screenshot({ path: testInfo.outputPath('native-composer-oversized-failure.png') });
    throw error;
  });
  await expect(fallback).toHaveAttribute('title', 'Claude stream-json protocol error: native UI tree exceeds node limit');
  expect(await readFile(join(workspace!, 'oversize-trigger.txt'), 'utf8')).toBe('1');
  await expect(editor).toHaveText('Unsent text survives oversized native output');
  expect(await snapshot()).toEqual(beforeOversize);
  await expect(strip.locator('button[data-native-plugin]')).toHaveCount(0);
  await appPage.screenshot({ path: testInfo.outputPath('native-composer-oversized-fallback.png') });
  // Deletion runs the backend thread teardown and disconnects any remaining live mount.
  await appPage.evaluate(threadId => (window as any).__sendToSystem('default-setup/threads', { type: 'DELETE_THREAD', threadId }), first.threadId);
  await expect(card.getByRole('button', { name: 'Run fixture', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
  await writeFile(join(workspace!, 'ui-app-evidence.json'), JSON.stringify({ renderedNativeTree: true, nativePress: true, invalidationRedraw: true, typedInputPreserved: true, noPhantomMessage: true, narrowOverflowBounded: true, secondHostTurn: true, singleNativeProcess: true, threadSwitchRemount: true, threadDeleteClearsControls: true, staleDrawingRejected: true, foreignThreadRejected: true, foreignMountRejected: true, validPressAfterRejectedActions: true, oversizedTreeFallback: true, oversizedInputPreserved: true, oversizedNoPhantomTurn: true, hostInputs: 2 }, null, 2));
});
