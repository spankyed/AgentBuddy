import { expect, it } from 'vitest';
import { startApp } from '@apackdev/testing/harness';
import { repository } from '#generated/repository.ts';

it('answers a flow selection under its request call instead of broadcasting navigation', async () => {
  const flowId = repository.flowsCommands.createFlow({ label: 'Selected flow' }).id;
  const app = await startApp({ systems: ['flows'] });
  await app.connect();
  const call = await app.send('flows', { type: 'FLOW_SELECT', flowId }, { sender: 'default-setup/flows', client: 'selection-window' });
  expect(await app.nextEmit('flows', 'FLOW_SELECTED', { answering: call })).toMatchObject({ flowId });
});

it('does not broadcast a selection when no window asked for it', async () => {
  const flowId = repository.flowsCommands.createFlow({ label: 'Unrequested flow' }).id;
  const app = await startApp({ systems: ['flows'] });
  await app.connect();
  await app.send('flows', { type: 'FLOW_SELECT', flowId });
  await app.settle();
  expect(app.emitted('flows').filter(event => event.type === 'FLOW_SELECTED')).toEqual([]);
});
