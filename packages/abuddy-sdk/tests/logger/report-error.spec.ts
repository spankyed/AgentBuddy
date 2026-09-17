// reportError and createLogger on the test host: what a system or step reports reaches the log, the
// user and, for a step, its TNode
import * as os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger, reportError, setDebugEnabled, type LogEvent } from '../../src/logger/index.ts';
import { startTestRuntime, takeSystemErrors, testRootEvents } from '../../src/testing/index.ts';
import { RepositoryError, RepositoryErrorCode, tx, untypedQx } from '@abuddy/ears';
import type { OutgoingSystemEvents } from '../../src/events/index.ts';
import type { EARS } from '../../src/types/entities.ts';

process.env.ABUDDY_ENV ??= 'test';
process.env.ABUDDY_USER_DATA_DIR ??= os.tmpdir();
startTestRuntime();


/** What reached the bus: log events, sends to plugins through the bus, and events straight to the clients */
function capture(run: () => void): { logs: LogEvent[]; toPlugins: OutgoingSystemEvents[]; outgoing: OutgoingSystemEvents[] } {
  const logs: LogEvent[] = [];
  const toPlugins: OutgoingSystemEvents[] = [];
  const outgoing: OutgoingSystemEvents[] = [];
  const stop = [
    testRootEvents.onLog((e) => logs.push(e)),
    testRootEvents.onPluginSend((e) => toPlugins.push(e)),
    testRootEvents.onOutgoing((e) => outgoing.push(e)),
  ];
  try {
    run();
  } finally {
    stop.forEach((unsubscribe) => unsubscribe());
  }
  return { logs, toPlugins, outgoing };
}

afterEach(() => {
  takeSystemErrors();
  vi.restoreAllMocks();
});

describe('reportError', () => {
  const tNodeId = 'TNode-1' as EARS.EntityId;

  it("with step context logs the error, sends it to the brain plugin and records it on the step's TNode", () => {
    const printed = vi.spyOn(console, 'error').mockImplementation(() => {});
    // The step's TNode, holding what the step ran with
    tx(tNodeId, true).put('entityType', 'TNode').put('nodeAttributes', { input: 'hello' });
    let returned: ReturnType<typeof reportError>;
    const { logs, toPlugins, outgoing } = capture(() => {
      returned = reportError({
        error: new Error('model failed'),
        source: 'brain-llm',
        step: { phase: 'llm.execute', tNodeId, nodeId: 'Node-1' as EARS.EntityId, nodeType: 'llm', eventType: 'user.message' },
      });
    });

    const { errorId, stack } = returned!;
    expect(returned!).toMatchObject({ source: 'brain-llm', phase: 'llm.execute', tNodeId, message: 'model failed' });
    expect(logs).toEqual([expect.objectContaining({ level: 'error', source: 'step-runtime', message: 'model failed', stack })]);
    // A log event, printed once as every log event is; the flow shows it, so there's no system error
    expect(printed).toHaveBeenCalledTimes(1);
    expect(toPlugins).toEqual([{ type: 'BRAIN_RUNTIME_ERROR', pluginId: 'brain', error: returned! }]);
    expect(outgoing).toEqual([]);
    expect(untypedQx(tNodeId).pickOne(['nodeAttributes'])?.nodeAttributes).toEqual({
      input: 'hello',
      result: { error: { message: 'model failed', source: 'brain-llm', phase: 'llm.execute', errorId, stack } },
    });
    expect(takeSystemErrors()).toEqual([]);
  });

  it('redacts key-shaped strings a provider error quotes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reported = capture(() => {
      reportError({ error: new Error('Incorrect API key provided: sk-proj-abcdef123456'), source: 'brain-llm', step: { phase: 'llm.execute' } });
    });
    expect(reported.logs).toHaveLength(1);
    expect(JSON.stringify(reported)).not.toContain('sk-proj-abcdef123456');
  });

  it('without step context logs a system error and sends it to the app to show', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('boom');
    const { logs, toPlugins, outgoing } = capture(() => {
      expect(reportError({ error, source: 'notes', title: 'Could not save', operation: 'save' })).toBeUndefined();
    });
    const event = {
      type: 'SYSTEM_ERROR', pluginId: 'application', errorId: expect.stringMatching(/^err_/), title: 'Could not save',
      message: 'boom', source: 'notes', operation: 'save', entityId: undefined, severity: 'error', stack: error.stack,
      timestamp: expect.any(Number),
    };
    expect(outgoing).toEqual([event]);
    expect(takeSystemErrors()).toEqual([event]);
    expect(logs).toEqual([expect.objectContaining({ level: 'error', source: 'notes', message: 'boom', stack: error.stack })]);
    expect(toPlugins).toEqual([]);
  });

  it("shows a user-safe message for a missing entity, and the report's own message over the error's", () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    reportError({ error: new RepositoryError('Note-1 not found', RepositoryErrorCode.NOT_FOUND), source: 'notes' });
    reportError({ error: new Error('disk full'), source: 'notes', userMessage: 'Could not save the note' });
    expect(takeSystemErrors().map((e) => e.message)).toEqual(['That item no longer exists.', 'Could not save the note']);
  });

  it('redacts key-shaped strings in a system error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reported = capture(() => reportError({ error: new Error('bad key sk-proj-abcdef1234567890'), source: 'notes' }));
    expect(reported.outgoing).toHaveLength(1);
    expect(JSON.stringify(reported)).not.toContain('sk-proj-abcdef1234567890');
  });
});

describe('createLogger', () => {
  it("logs debug messages of a { debug: true } logger only while its source's toggle is on", () => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const logger = createLogger('gated-source', { debug: true });

    setDebugEnabled('gated-source', false);
    expect(capture(() => { logger.debug('hidden'); logger.info('shown'); }).logs.map((e) => e.message)).toEqual(['shown']);

    setDebugEnabled('gated-source', true);
    expect(capture(() => logger.debug('visible')).logs.map((e) => e.message)).toEqual(['visible']);
  });
});
