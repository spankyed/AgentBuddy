import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect } from '@apackdev/testing';

const workspace = process.env.CLAUDE_RESEARCH_WORKSPACE;
const launcher = process.env.CLAUDE_RESEARCH_LAUNCHER;
const endpoint = process.env.CLAUDE_RESEARCH_MODEL_URL;

test.skip(!workspace || !launcher || !endpoint, 'Explicit private native research fixture required');

test('native question selection reaches its retained process without submitting composer text', async ({ app, appPage }, testInfo) => {
  expect(process.env.HOME).toBe(workspace);
  expect(new URL(endpoint!).hostname).toBe('127.0.0.1');
  for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN']) expect(process.env[key]).toBeUndefined();
  const errors: string[] = [];
  appPage.on('pageerror', error => errors.push(error.message));
  await appPage.setViewportSize({ width: 1400, height: 1400 });
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
  const question = appPage.locator('.question-input');
  await expect(question.getByText('Which synthetic fixture should be selected?', { exact: true })).toBeVisible({ timeout: 20000 });
  const snapshot = () => appPage.evaluate(() => {
    const thread = (window as any).applicationState.system.get('default-setup/threads').getSnapshot().context.currentThread;
    return { threadId: thread?.id, turns: thread?.context?.claudeCode?.turns, pending: thread?.context?.claudeCode?.pendingControlRequest };
  });
  const pending = await snapshot();
  expect(pending.pending?.toolName).toBe('AskUserQuestion');
  expect(pending.pending?.requestId).toBeTruthy();
  await question.scrollIntoViewIfNeeded();
  await appPage.screenshot({ path: testInfo.outputPath('native-question-pending.png') });
  await editor.fill('Unsent composer text survives question response');
  await question.getByText('Alpha', { exact: true }).click();
  await expect.poll(async () => (await snapshot()).turns).toBe(1);
  await expect.poll(async () => (await snapshot()).pending).toBeUndefined();
  await expect(editor).toHaveText('Unsent composer text survives question response');
  expect((await snapshot()).threadId).toBe(pending.threadId);
  await expect(question.getByRole('button', { name: 'Submit', exact: true })).toHaveCount(0);
  const launches = (await readFile(join(workspace!, 'native-launches.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  expect(launches.filter(value => value.args.includes('--input-format'))).toHaveLength(1);
  expect(errors).toEqual([]);
  await appPage.screenshot({ path: testInfo.outputPath('native-question-answered.png') });
  await writeFile(join(workspace!, 'question-app-evidence.json'), JSON.stringify({ renderedQuestion: true, selectedAnswer: true, typedInputPreserved: true, sameNativeProcess: true, oneHostTurn: true, noPendingQuestion: true, requestId: pending.pending.requestId }, null, 2));
});
