// The fixture sends to its own system by feature id and to its dependency's (default-setup) by system id,
// both through the sendToSystem its #generated/events types with every system's events.
import { describe, expect, it } from 'vitest';
import { startApp } from '@abuddy/testing/harness';
import { sendToSystem } from '#generated/events';
import { busId } from '#generated/bus-ids';

describe('typed sends to systems', () => {
  it("reaches default-setup's settings system", async () => {
    const app = await startApp({ systems: ['settings'] });
    await app.connect();
    await app.nextEmit('settings', 'SETTINGS_LOADED');

    sendToSystem('settings', { type: 'GET_SETTINGS' });

    expect(await app.nextEmit('settings', 'SETTINGS_LOADED')).toMatchObject({ type: 'SETTINGS_LOADED', pluginId: 'settings' });
  });

  it('reaches its own system by feature id', async () => {
    const app = await startApp({ systems: ['memos'] });
    await app.connect();

    sendToSystem('memos', { type: 'ADD_MEMO', text: 'typed' });

    expect(await app.nextEmit('memos', 'MEMO_ADDED')).toMatchObject({ memo: { text: 'typed' } });
  });

  it('rejects a wrong send at compile time', () => {
    // Never called: tsc checks these lines when it runs over the pack's tests
    const wrongSends = () => {
      // @ts-expect-error the settings system doesn't receive memo events
      sendToSystem('settings', { type: 'ADD_MEMO', text: 'x' });
      // @ts-expect-error ADD_MEMO needs its text
      sendToSystem('memos', { type: 'ADD_MEMO' });
      // @ts-expect-error own systems are addressed by feature id; sendToSystem maps it to the bus id
      sendToSystem(busId.memos, { type: 'ADD_MEMO', text: 'x' });
    };
    expect(wrongSends).toBeTypeOf('function');
  });
});
