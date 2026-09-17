// Service mocks last one test: the harness restores services after each, and inference fails until a test mocks it.
// A test app's waits and calls end when it stops, and events the bus dropped for its systems before a client connected are named.
import { describe, expect, it } from 'vitest';
import { mockInference, mockService, startApp } from '@abuddy/testing/harness';
import { services } from '#generated/services';
import { busId } from '#generated/bus-ids';
import { sendToSystem } from '#generated/events';

const scripted = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

describe('harness isolation between tests', () => {
  it('mocks a service and inference for this test', async () => {
    mockService('logger', scripted);
    mockInference('scripted');
    expect(services.logger).toBe(scripted);
    expect((await services.inference.generateText({ model: 'openai:gpt-5', prompt: 'hi' })).text).toBe('scripted');
  });

  it('has the real logger, and inference that fails naming the fix, in the next test', async () => {
    expect(services.logger).not.toBe(scripted);
    await expect(services.inference.generateText({ model: 'openai:gpt-5', prompt: 'hi' })).rejects.toThrow('mock inference with mockInference(reply)');
  });
});

describe('a stopped test app', () => {
  it('ends the waits it had with an error saying it stopped', async () => {
    const app = await startApp({ systems: ['memos'] });
    const waiting = app.nextEmit('memos', 'NEVER_SENT', { timeoutMs: 60_000 });

    app.stop();

    await expect(waiting).rejects.toThrow('The test app stopped');
    await expect(app.nextEmit('memos', 'NEVER_SENT')).rejects.toThrow('The test app stopped');
  });

  it("ends a wait nobody awaits when the harness stops the app, without an unhandled rejection", async () => {
    const app = await startApp({ systems: ['memos'] });
    // The run fails on an unhandled rejection: stopping after this test must not leave one
    void app.nextEmit('memos', 'NEVER_SENT', { timeoutMs: 60_000 });
  });

  it('fails every call made after it stopped, without an unhandled rejection for one nobody awaits', async () => {
    const app = await startApp({ systems: ['memos'] });
    app.stop();

    void app.nextEmit('memos', 'NEVER_SENT');
    await expect(app.connect()).rejects.toThrow('The test app stopped');
    await expect(app.send('memos', { type: 'ADD_MEMO', text: 'too late' })).rejects.toThrow('The test app stopped');
    await expect(app.settle()).rejects.toThrow('The test app stopped');
    await expect(app.runFlow('Memo Flow')).rejects.toThrow('The test app stopped');
    expect(() => app.system('memos')).toThrow('The test app stopped');
  });
});

describe('events sent before a client connects', () => {
  it('are dropped by the bus, and a wait that times out names them', async () => {
    const app = await startApp({ systems: ['memos'] });
    sendToSystem('memos', { type: 'ADD_MEMO', text: 'too early' });

    await expect(app.nextEmit('memos', 'MEMO_ADDED', { timeoutMs: 100 })).rejects.toThrow(`The bus dropped 1 event(s) sent before the app connected: ADD_MEMO to ${busId.memos}`);
  });

  it("are an app's own: events a connected app's systems get aren't dropped by another app", async () => {
    const memosApp = await startApp({ systems: ['memos'] });
    await memosApp.connect();
    const settingsApp = await startApp({ systems: ['settings'] });

    sendToSystem('memos', { type: 'ADD_MEMO', text: 'for the connected app' });

    expect(await memosApp.nextEmit('memos', 'MEMO_ADDED')).toMatchObject({ memo: { text: 'for the connected app' } });
    const waited = await settingsApp.nextEmit('settings', 'NEVER_SENT', { timeoutMs: 100 }).catch((error: Error) => error);
    expect(waited).toBeInstanceOf(Error);
    expect((waited as Error).message).toContain('No NEVER_SENT sent to settings within 100ms');
    expect((waited as Error).message).not.toContain('dropped');
  });
});
