import { test, expect } from '@apack/testing';

test('pack loads and renders', async ({ app }) => {
  await app.waitForPlugin('__PLUGIN_ID__');
  await app.navigate('__PLUGIN_ID__');
  await app.screenshot('pack-default');
});

test('app reaches connected state', async ({ app }) => {
  const state = await app.getState();
  expect(state).toEqual({ running: 'connected' });
});
