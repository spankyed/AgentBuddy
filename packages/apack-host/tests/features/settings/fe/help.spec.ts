import { afterAll, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { startFeTestRuntime } from '@apackdev/sdk/testing';
import { createSettingsMachine } from '../../../../src/features/settings/fe/machine.ts';

const settings = { general: {}, plugins: {}, assistant: {} };
afterAll(startFeTestRuntime({ client: { send() {} } }));
function startSettings() {
  return createActor(createSettingsMachine({ restart() {}, report() {} })).start();
}

it('opens Help before Settings finishes loading and keeps it open when settings arrive', () => {
  const actor = startSettings();
  actor.send({ type: 'HELP.OPEN', target: { packId: 'pack', articleId: 'start' } });
  actor.send({ type: 'SETTINGS_LOADED', data: settings });
  expect(actor.getSnapshot().context).toMatchObject({ activeTab: 'help', help: { target: { packId: 'pack', articleId: 'start' } } });
  actor.stop();
});

it('preserves an unavailable article through catalog refreshes without modifying settings', () => {
  const actor = startSettings();
  actor.send({ type: 'SETTINGS_LOADED', data: settings });
  actor.send({ type: 'HELP.OPEN', target: { packId: 'pack', articleId: 'start' } });
  actor.send({ type: 'HELP_CATALOG', catalog: { articles: [], problems: [] } });
  expect(actor.getSnapshot().context.help).toMatchObject({ target: { packId: 'pack', articleId: 'start' }, loading: false });
  expect(actor.getSnapshot().context.settings).toEqual(settings);
  actor.stop();
});

it('keeps feature filters while searching and restores the search after reading an article', () => {
  const actor = startSettings();
  actor.send({ type: 'HELP.OPEN', target: { packId: 'pack', featureId: 'code' } });
  actor.send({ type: 'HELP.SEARCH', query: 'permissions' });
  actor.send({ type: 'HELP.READ', packId: 'pack', articleId: 'token' });
  expect(actor.getSnapshot().context.help.target.featureId).toBe('code');
  actor.send({ type: 'HELP.BACK' });
  expect(actor.getSnapshot().context.help).toMatchObject({ target: { packId: 'pack', featureId: 'code' }, query: 'permissions', history: [] });
  actor.send({ type: 'HELP.OPEN', target: {} });
  expect(actor.getSnapshot().context.help).toMatchObject({ target: {}, query: '', history: [] });
  actor.stop();
});
