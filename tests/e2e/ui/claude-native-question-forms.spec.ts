import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect } from '@apackdev/testing';

const workspace = process.env.CLAUDE_RESEARCH_WORKSPACE;
const launcher = process.env.CLAUDE_RESEARCH_LAUNCHER;
const endpoint = process.env.CLAUDE_RESEARCH_MODEL_URL;

test.skip(!workspace || !launcher || !endpoint, 'Explicit private native research fixture required');

test('native question forms preserve custom drafts and multi-select choices', async ({ app, appPage }, testInfo) => {
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
  const messageState = (messageId: string) => appPage.evaluate(id => {
    const thread = (window as any).applicationState.system.get('default-setup/threads').getSnapshot().context.currentThread;
    const message = thread.messages.find((value: any) => value.id === id);
    return { blockResponse: message?.blockResponse, responseTimestamp: message?.responseTimestamp, asideText: message?.asideText };
  }, messageId);
  // The tab reply is a same-channel barrier that does not require native controls during a question.
  const deliveryBarrier = async (threadId: string) => appPage.evaluate(id => new Promise<void>((resolve, reject) => {
    const actor = (window as any).applicationState.system.get('default-setup/threads');
    const timer = setTimeout(() => { observer.unsubscribe(); reject(new Error('Missing thread-tab delivery barrier')); }, 5000);
    const observer = actor.system.inspect((event: any) => {
      if (event.type === '@xstate.event' && event.actorRef === actor && event.event.type === 'THREAD_TAB_REQUESTED' && event.event.threadId === id) {
        clearTimeout(timer); observer.unsubscribe(); resolve();
      }
    });
    (window as any).__sendToSystem('default-setup/threads', { type: 'OPEN_THREAD_TAB', threadId: id, label: 'Question delivery barrier' });
  }), threadId);
  const pending = await snapshot();
  expect(pending.pending?.toolName).toBe('AskUserQuestion');
  expect(pending.pending?.requestId).toBeTruthy();
  await editor.fill('Unsent composer text survives the question wizard');
  await question.getByPlaceholder('Type your response...').fill('Custom fixture answer');
  await question.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(question.getByText('Which second synthetic fixture should be selected?', { exact: true })).toBeVisible();
  expect((await snapshot()).pending).toEqual(pending.pending);
  await question.scrollIntoViewIfNeeded();
  await appPage.screenshot({ path: testInfo.outputPath('native-question-forms-second.png') });
  await question.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(question.getByText('Which synthetic fixture should be selected?', { exact: true })).toBeVisible();
  await expect(question.getByPlaceholder('Type your response...')).toHaveValue('Custom fixture answer');
  await appPage.screenshot({ path: testInfo.outputPath('native-question-forms-restored.png') });
  // The custom draft remains visible and keeps Next enabled.
  await expect(question.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
  await question.getByRole('button', { name: 'Next', exact: true }).click();
  await question.getByText('Gamma', { exact: true }).click();
  await question.getByText('Delta', { exact: true }).click();
  await question.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(question.getByPlaceholder('Type your response...')).toHaveValue('Custom fixture answer');
  await question.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(question.getByRole('button', { name: 'Submit', exact: true })).toBeEnabled();
  expect((await snapshot()).pending).toEqual(pending.pending);
  await question.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect.poll(async () => (await snapshot()).turns).toBe(1);
  await expect.poll(async () => (await snapshot()).pending).toBeUndefined();
  await expect(editor).toHaveText('Unsent composer text survives the question wizard');
  await expect(question.getByRole('button', { name: 'Submit', exact: true })).toHaveCount(0);
  await appPage.screenshot({ path: testInfo.outputPath('native-question-forms-answered.png') });
  await appPage.evaluate(cwd => {
    const threads = (window as any).applicationState.system.get('default-setup/threads');
    threads.send({ type: 'NEW_THREAD_IN_PROJECT', directory: cwd });
    threads.send({ type: 'VIEW_DASHBOARD' });
    threads.send({ type: 'SET_MODE', mode: 'Claude Code' });
  }, workspace!);
  await editor.fill('Synthetic question wizard to cancel');
  await card.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(question.getByText('Which synthetic fixture should be selected?', { exact: true })).toBeVisible({ timeout: 20000 });
  const retiring = await snapshot();
  expect(retiring.threadId).not.toBe(pending.threadId);
  expect(retiring.pending?.requestId).toBeTruthy();
  await question.getByText('Alpha', { exact: true }).click();
  await question.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(question.getByText('Which second synthetic fixture should be selected?', { exact: true })).toBeVisible();
  await editor.fill('Unsent composer text survives wizard cancellation');
  await question.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect.poll(async () => (await snapshot()).pending).toBeUndefined();
  await expect(question.getByRole('button')).toHaveCount(0);
  await expect(editor).toHaveText('Unsent composer text survives wizard cancellation');
  const cancelled = await messageState(retiring.pending.approvalMessageId);
  expect(cancelled.blockResponse).toEqual({ cancelled: true });
  await appPage.evaluate(({ threadId, messageId }) => (window as any).__sendToSystem('default-setup/threads', { type: 'INTERACTIVE_MSG_RESPONSE', threadId, messageId, response: 'Beta' }), { threadId: retiring.threadId, messageId: retiring.pending.approvalMessageId });
  await deliveryBarrier(retiring.threadId);
  expect(await messageState(retiring.pending.approvalMessageId)).toEqual(cancelled);
  const children = (await readFile(join(workspace!, 'native-child-processes.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line)).filter(value => value.args.includes('--input-format'));
  expect(children).toHaveLength(2);
  await expect.poll(async () => (await readFile(join(workspace!, 'native-child-exits.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line)).some(value => value.pid === children[1].pid)).toBe(true);
  await appPage.screenshot({ path: testInfo.outputPath('native-question-forms-cancelled.png') });
  const launches = (await readFile(join(workspace!, 'native-launches.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  expect(launches.filter(value => value.args.includes('--input-format'))).toHaveLength(2);
  expect(errors).toEqual([]);
  await writeFile(join(workspace!, 'question-forms-app-evidence.json'), JSON.stringify({ freeTextRoundTrip: true, multiSelectRoundTrip: true, draftsRestoredAfterBack: true, renderedWizard: true, backPreservesChoice: true, oneReplyAfterFinalSubmit: true, cancelButtonRetiresQuestion: true, cancelledChildExitObserved: true, lateCancelledAnswerRejected: true, typedInputPreserved: true, requestId: pending.pending.requestId, retiredRequestId: retiring.pending.requestId, hostInputs: 2, nativeProcesses: 2 }, null, 2));
});
