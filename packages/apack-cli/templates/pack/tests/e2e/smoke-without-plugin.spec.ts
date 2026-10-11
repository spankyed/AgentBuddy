import { test, expect } from '@apack/testing';

test('pack loads and renders', async ({ app }) => {
  // await app.waitForPlugin('your-plugin-id');
  // await app.navigate('your-plugin-id');
  await app.screenshot('pack-default');
});

test('app reaches connected state', async ({ app }) => {
  const state = await app.getState();
  expect(state).toEqual({ running: 'connected' });
});
