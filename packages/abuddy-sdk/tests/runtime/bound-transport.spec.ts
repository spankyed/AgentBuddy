// Sends, logging and error reports are SDK code over the bound app's bus: here the test host's
import * as os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startTestRuntime, takeSystemErrors, testRootEvents } from '../../src/testing/index.ts';
import { testPacksView } from '../../src/testing/packs.ts';
import { resolveName } from '../../src/ids/index.ts';
import { onIncoming, untypedBroadcastToPlugin, untypedSendToSystem } from '../../src/events/index.ts';
import { bindFeHost, unbindFeHost } from '../../src/runtime/fe-host.ts';
import { createLogger, onLog, reportError, type LogEvent } from '../../src/logger/index.ts';
import { services } from '../../src/services/index.ts';
import { testPacks } from '../../src/testing/packs.ts';
import type { Message } from '../../src/events/index.ts';

process.env.ABUDDY_ENV ??= 'test';
process.env.ABUDDY_USER_DATA_DIR ??= os.tmpdir();
// services.emitter sends only to a registered plugin
startTestRuntime({ packs: { ...testPacksView(), pluginIds: () => [resolveName('memo-pack/memos')] } });

afterEach(() => {
  takeSystemErrors();
  vi.restoreAllMocks();
});

/** Everything `run` put on the bus */
function onBus(run: () => void) {
  const logs: LogEvent[] = [];
  const toPlugins: Message[] = [];
  const outgoing: Message[] = [];
  const incoming: Message[] = [];
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
  it('untypedBroadcastToPlugin and services.emitter.broadcastToPlugin go to the bus, which delivers them, not to the clients directly', () => {
    const sent = onBus(() => {
      // The untyped send takes the id a plugin runs under; the emitter takes the name an action writes
      untypedBroadcastToPlugin('memo-pack/memos', { type: 'MEMO_ADDED' });
      services.emitter.broadcastToPlugin('memo-pack/memos', { type: 'MEMO_REMOVED' });
    });
    expect(sent.toPlugins).toEqual([
      { to: 'memo-pack/memos', event: { type: 'MEMO_ADDED' } },
      { to: 'memo-pack/memos', event: { type: 'MEMO_REMOVED' } },
    ]);
    expect(sent.outgoing).toEqual([]);
  });

  // Where a message goes is never a field of its event, so an event may carry any field of its own
  it('delivers an event exactly as it was sent, a field named pluginId or systemId included', () => {
    const sent = onBus(() => {
      untypedBroadcastToPlugin('memo-pack/memos', { type: 'PLUGIN_PICKED', pluginId: 'default-setup/notes' });
      untypedSendToSystem('memo-pack/memos', { type: 'OPEN', systemId: 'kept', pluginId: 'also-kept' });
    });
    expect(sent.toPlugins).toEqual([{ to: 'memo-pack/memos', event: { type: 'PLUGIN_PICKED', pluginId: 'default-setup/notes' } }]);
    expect(sent.incoming).toEqual([{ to: 'memo-pack/memos', event: { type: 'OPEN', systemId: 'kept', pluginId: 'also-kept' } }]);
  });

  it('untypedSendToSystem sends to the system that plays a role', () => {
    testPacks.designations.set('brain', 'brain-system');
    try {
      expect(onBus(() => untypedSendToSystem({ role: 'brain' }, { type: 'TRIGGER_BRAIN_EVENT', eventType: 'user.message', payload: 1 })).incoming)
        .toEqual([{ to: 'brain-system', event: { type: 'TRIGGER_BRAIN_EVENT', eventType: 'user.message', payload: 1 } }]);
    } finally {
      testPacks.designations.delete('brain');
    }
  });

  it('onIncoming and onLog hear the bus until unsubscribed', () => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    const heard: unknown[] = [];
    const stop = [onIncoming((e) => heard.push(e)), onLog((e) => heard.push(e))];
    testRootEvents.emitIncoming({ to: 'memos', event: { type: 'ADD_MEMO' } });
    testRootEvents.emitLog({ level: 'debug', message: 'x' });
    stop.forEach((unsubscribe) => unsubscribe());
    testRootEvents.emitIncoming({ to: 'memos', event: { type: 'ADD_MEMO' } });
    testRootEvents.emitLog({ level: 'debug', message: 'y' });
    expect(heard).toEqual([{ to: 'memos', event: { type: 'ADD_MEMO' } }, { level: 'debug', message: 'x' }]);
  });

  it('reportError logs a system error and sends it to the clients', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sent = onBus(() => reportError({ error: new Error('boom'), source: 'memos', operation: 'save' }));
    // `via` is the source, the only thing a report knows about its caller — there is no pack here to put in `from`
    expect(sent.outgoing).toEqual([{ to: 'host/application', via: 'memos', event: expect.objectContaining({ type: 'SYSTEM_ERROR', source: 'memos', message: 'boom' }) }]);
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

describe('with a frontend bound too', () => {
  it('sends to systems through the frontend, whose packs the lookups read', () => {
    const sentByFrontend: Message[] = [];
    bindFeHost({
      application: {} as never,
      secrets: {} as never,
    settings: {} as never,
      client: { send: (message) => sentByFrontend.push(message) },
      packs: { designation: (role: string) => (role === 'brain' ? 'brain-plugin' : undefined) } as never,
    });
    try {
      const sent = onBus(() => {
        untypedSendToSystem('memos', { type: 'ADD_MEMO' });
        untypedSendToSystem({ role: 'brain' }, { type: 'TRIGGER_BRAIN_EVENT', eventType: 'user.message' });
      });
      expect(sent.incoming).toEqual([]);
      expect(sentByFrontend).toEqual([
        { to: 'memos', event: { type: 'ADD_MEMO' } },
        { to: 'brain-plugin', event: { type: 'TRIGGER_BRAIN_EVENT', eventType: 'user.message' } },
      ]);
    } finally {
      unbindFeHost();
    }
  });
});
