import { test, expect } from '@apackdev/testing';

test('the running brain gives an external step its own service scope', async ({ app, appPage }) => {
  await app.waitForPlugin('memos');
  await app.navigate('default-setup/flows');
  const { flow, originalRoot } = await appPage.evaluate(() => {
    const { flows, rootFlowId } = (window as any).applicationState.system.get('default-setup/flows').getSnapshot().context;
    return { flow: flows.find((flow: { label: string }) => flow.label === 'Stamp Flow'), originalRoot: rootFlowId };
  });
  expect(flow?.id).toBeTruthy();
  try {
    await appPage.evaluate(id => (window as any).__sendToSystem('default-setup/flows', { type: 'SET_ROOT_FLOW', flowId: id }), flow.id);
    await expect.poll(() => appPage.evaluate(() => (window as any).applicationState.system
      .get('default-setup/flows').getSnapshot().context.rootFlowId)).toBe(flow.id);
    await appPage.evaluate(() => (window as any).__sendToSystem('default-setup/brain', { type: 'RESTART_BRAIN' }));
    await app.navigate('memos');
    // The brain queues this event until startup. Only the fixture pack owns memoStamp; a runner-owned
    // factory refuses that lookup instead of writing the memo through the external step.
    await appPage.evaluate(() => (window as any).__sendToSystem('default-setup/brain', {
      type: 'TRIGGER_BRAIN_EVENT', eventType: 'stamp.requested',
    }));
    // Ask for fresh memo state after the step writes; writes through a repository do not push plugin data.
    await expect(async () => {
      await appPage.evaluate(() => (window as any).__sendToSystem('e2e-fixture/memos', { type: 'SEND_STATE' }));
      await expect(appPage.getByTestId('memo-list').getByText('step-owner service reached', { exact: true })).toBeVisible();
    }).toPass({ timeout: 15_000 });
  } finally {
    await appPage.evaluate(id => (window as any).__sendToSystem('default-setup/flows', { type: 'SET_ROOT_FLOW', flowId: id ?? null }), originalRoot);
    await appPage.evaluate(() => (window as any).__sendToSystem('default-setup/brain', { type: 'RESTART_BRAIN' }));
  }
});
