import { afterAll, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { startFeTestRuntime } from '@apackdev/sdk/testing';
import { helpMachine } from '../../../src/features/help/fe/machine.ts';

afterAll(startFeTestRuntime({ client: { send() {} } }));
it('keeps a selected article across refreshes and retains unavailable targets for the reader to explain', () => {
  const actor = createActor(helpMachine).start();
  actor.send({ type: 'HELP.OPEN', target: { packId: 'pack', articleId: 'start' } });
  const articles = [{ packId: 'pack', packName: 'Pack', id: 'start', title: 'Start', body: 'Details' }];
  actor.send({ type: 'HELP_CATALOG', catalog: { articles, problems: [] } });
  expect(actor.getSnapshot().context.target.articleId).toBe('start');
  actor.send({ type: 'HELP_CATALOG', catalog: { articles: [], problems: [] } });
  expect(actor.getSnapshot().context.target).toEqual({ packId: 'pack', articleId: 'start' });
  actor.send({ type: 'HELP.BACK' });
  expect(actor.getSnapshot().context.target).toEqual({});
  actor.stop();
});
it('searching returns to the index and clears stale navigation history', () => {
  const actor = createActor(helpMachine).start();
  actor.send({ type: 'HELP.OPEN', target: { packId: 'pack', featureId: 'code' } });
  actor.send({ type: 'HELP.SEARCH', query: 'permissions' });
  expect(actor.getSnapshot().context).toMatchObject({ target: {}, history: [], query: 'permissions' });
  actor.stop();
});
