// Sends, logging and error reports are SDK code over the bound app's bus: here the test host's
import * as os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startTestRuntime, takeSystemErrors, testRootEvents } from '../../src/testing/index.ts';
import { onIncoming, sendToBrainSystem, sendToPlugin } from '../../src/events/index.ts';
import { createLogger, onLog, reportError, type LogEvent } from '../../src/logger/index.ts';
import { services } from '../../src/services/index.ts';
import { testPacks } from '../../src/testing/packs.ts';
import type { IncomingSystemEvents, OutgoingSystemEvents } from '../../src/events/index.ts';

process.env.ABUDDY_ENV ??= 'test';
process.env.ABUDDY_USER_DATA_DIR ??= os.tmpdir();
startTestRuntime();

afterEach(() => {
  takeSystemErrors();
  vi.restoreAllMocks();
});

/** Everything `run` put on the bus */
function onBus(run: () => void) {
  const logs: LogEvent[] = [];
  const toPlugins: OutgoingSystemEvents[] = [];
  const outgoing: OutgoingSystemEvents[] = [];
  const incoming: IncomingSystemEvents[] = [];
  const stop = [
    testRootEvents.onLog((e) => logs.push(e)),
    testRootEvents.onPluginSend((e) => toPlugins.push(e)),
    testRootEvents.onOutgoing((e) => outgoing.push(e)),
    testRootEvents.onIncoming((e) => incoming.push(e)),
  ];
  try {
    run();
  } finally {
    stop.forEach((unsubscribe) => unsubscribe());
  }
  return { logs, toPlugins, outgoing, incoming };
}

describe('on the bound bus', () => {
  it('sendToPlugin and services.emitter.sendToPlugin go to the bus, which delivers them, not to the clients directly', () => {
    const sent = onBus(() => {
      sendToPlugin('memos', { type: 'MEMO_ADDED' });
      services.emitter.sendToPlugin('memos', { type: 'MEMO_REMOVED' });
    });
    expect(sent.toPlugins).toEqual([{ type: 'MEMO_ADDED', pluginId: 'memos' }, { type: 'MEMO_REMOVED', pluginId: 'memos' }]);
    expect(sent.outgoing).toEqual([]);
  });

  it('sendToBrainSystem sends to the designated brain', () => {
    testPacks.designations.set('brain', 'brain-system');
    try {
      expect(onBus(() => sendToBrainSystem({ eventType: 'user.message', payload: 1 })).incoming)
        .toEqual([{ type: 'TRIGGER_BRAIN_EVENT', eventType: 'user.message', payload: 1, systemId: 'brain-system' }]);
    } finally {
      testPacks.designations.delete('brain');
    }
  });

  it('onIncoming and onLog hear the bus until unsubscribed', () => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    const heard: unknown[] = [];
    const stop = [onIncoming((e) => heard.push(e)), onLog((e) => heard.push(e))];
    testRootEvents.emitIncoming({ type: 'ADD_MEMO', systemId: 'memos' });
    testRootEvents.emitLog({ level: 'debug', message: 'x' });
    stop.forEach((unsubscribe) => unsubscribe());
    testRootEvents.emitIncoming({ type: 'ADD_MEMO', systemId: 'memos' });
    testRootEvents.emitLog({ level: 'debug', message: 'y' });
    expect(heard).toEqual([{ type: 'ADD_MEMO', systemId: 'memos' }, { level: 'debug', message: 'x' }]);
  });

  it('reportError logs a system error and sends it to the clients', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sent = onBus(() => reportError({ error: new Error('boom'), source: 'memos', operation: 'save' }));
    expect(sent.outgoing).toEqual([expect.objectContaining({ type: 'SYSTEM_ERROR', pluginId: 'application', source: 'memos', message: 'boom' })]);
    expect(sent.logs).toEqual([expect.objectContaining({ level: 'error', source: 'memos', message: 'boom' })]);
    expect(takeSystemErrors()).toHaveLength(1);
  });

  it('createLogger emits one redacted log event per entry, with meta that JSON holds and an error stack, and prints only through the bus', () => {
    const printed = vi.spyOn(console, 'error').mockImplementation(() => {});
    const circular: Record<string, unknown> = { apiKey: 'plain', fn: () => {} };
    circular.self = circular;
    const failure = new Error('bad key sk-proj-abcdef1234567890');
    const { logs } = onBus(() => createLogger('memos').error('saving sk-ant-abcdef1234567890 failed', { error: failure, circular }));
    expect(logs).toEqual([{
      level: 'error',
      source: 'memos',
      message: 'saving [redacted] failed',
      meta: {
        error: { name: 'Error', message: 'bad key [redacted]', stack: expect.stringContaining('bad key [redacted]') },
        circular: { apiKey: '[redacted]', fn: '[Function]', self: '[Circular Reference]' },
      },
      stack: expect.stringContaining('bad key [redacted]'),
    }]);
    // The test host prints each log event once, as the app's log capture does
    expect(printed).toHaveBeenCalledTimes(1);
  });

  it("gives an error entry without an error the stack where it was logged", () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { logs } = onBus(() => createLogger('memos').error('no error given'));
    expect(logs[0].stack).toContain('bound-transport.spec.ts');
  });
});
