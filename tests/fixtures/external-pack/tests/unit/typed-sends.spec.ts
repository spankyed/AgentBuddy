// The fixture sends to its own system by feature id and to its dependency's (default-setup) as
// default-setup/<feature>, both through the sendToSystem its #generated/events types with every system's
// events. Plugins are named the same way, so `nextEmit` takes this pack's own by feature id and a
// dependency's as default-setup/<feature>, and reports the id the plugin runs under.
import { describe, expect, it } from 'vitest';
import { startApp } from '@abuddy/testing/harness';
import { sendToSystem } from '#generated/events';

describe('typed sends to systems', () => {
  it("reaches default-setup's settings system", async () => {
    const app = await startApp({ systems: ['default-setup/settings'] });
    await app.connect();
    await app.nextEmit('default-setup/settings', 'SETTINGS_LOADED');

    sendToSystem('default-setup/settings', { type: 'GET_SETTINGS' });

    expect(await app.nextEmit('default-setup/settings', 'SETTINGS_LOADED'))
      .toMatchObject({ type: 'SETTINGS_LOADED', pluginId: 'default-setup.settings' });
  });

  it('reaches its own system by feature id', async () => {
    const app = await startApp({ systems: ['memos'] });
    await app.connect();

    sendToSystem('memos', { type: 'ADD_MEMO', text: 'typed' });

    expect(await app.nextEmit('memos', 'MEMO_ADDED')).toMatchObject({ memo: { text: 'typed' } });
  });

  // The name `emit` takes for a dependency's plugin is the one the send resolves: it arrives at that
  // pack's address, not at one in this pack's namespace
  it("reaches a dependency's plugin named <dependency>/<feature>", async () => {
    const app = await startApp({ systems: ['memos'] });
    await app.connect();

    sendToSystem('memos', { type: 'ANNOUNCE_MEMO', text: 'hello' });

    expect(await app.nextEmit('default-setup/logs', 'LOG_ADDED'))
      .toMatchObject({ pluginId: 'default-setup.logs', log: { message: 'hello', source: 'memos' } });
  });

  it('rejects a wrong send at compile time', () => {
    // Never called: tsc checks these lines when it runs over the pack's tests
    const wrongSends = () => {
      // @ts-expect-error the settings system doesn't receive memo events
      sendToSystem('default-setup/settings', { type: 'ADD_MEMO', text: 'x' });
      // @ts-expect-error a dependency's system is named <dependency>/<feature>
      sendToSystem('settings', { type: 'GET_SETTINGS' });
      // @ts-expect-error ADD_MEMO needs its text
      sendToSystem('memos', { type: 'ADD_MEMO' });
      // @ts-expect-error pack code names its own systems by feature id, never by the address sendToSystem maps it to
      sendToSystem('e2e-fixture.memos', { type: 'ADD_MEMO', text: 'x' });
    };
    expect(wrongSends).toBeTypeOf('function');
  });
});
