// reportError and createLogger on the test host: what a system or step reports reaches the log, the
// user and, for a step, its TNode
import * as os from 'node:os';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createLogger, reportError, setDebugEnabled, type LogEvent } from '../../src/logger/index.ts';
import { startTestRuntime, takeSystemErrors, testRootEvents } from '../../src/testing/index.ts';
import { registerRepository } from '../../src/ears/repository.ts';
import type { OutgoingSystemEvents } from '../../src/events/index.ts';
import type { EARS } from '../../src/types/entities.ts';

process.env.ABUDDY_ENV ??= 'test';
process.env.ABUDDY_USER_DATA_DIR ??= os.tmpdir();
startTestRuntime();

const tNodeResults: Array<{ id: EARS.EntityId; result: unknown }> = [];
beforeAll(() => {
  registerRepository('brainCommands', {
    updateTNodeResult: (id: EARS.EntityId, result: unknown) => { tNodeResults.push({ id, result }); },
  });
});

function capture(run: () => void): { logs: LogEvent[]; outgoing: OutgoingSystemEvents[] } {
  const logs: LogEvent[] = [];
  const outgoing: OutgoingSystemEvents[] = [];
  const stop = [testRootEvents.onLog((e) => logs.push(e)), testRootEvents.onOutgoing((e) => outgoing.push(e))];
  try {
    run();
  } finally {
    stop.forEach((unsubscribe) => unsubscribe());
  }
  return { logs, outgoing };
}

afterEach(() => {
  tNodeResults.length = 0;
  takeSystemErrors();
  vi.restoreAllMocks();
});

describe('reportError', () => {
  const tNodeId = 'TNode-1' as EARS.EntityId;

  it("with step context logs the error, sends it to the brain plugin and records it on the step's TNode", () => {
    let returned: ReturnType<typeof reportError>;
    const { logs, outgoing } = capture(() => {
      returned = reportError({
        error: new Error('model failed'),
        source: 'brain-llm',
        step: { phase: 'llm.execute', tNodeId, nodeId: 'Node-1' as EARS.EntityId, nodeType: 'llm', eventType: 'user.message' },
      });
    });

    const { errorId, stack } = returned!;
    expect(returned!).toMatchObject({ source: 'brain-llm', phase: 'llm.execute', tNodeId, message: 'model failed' });
    expect(logs).toEqual([expect.objectContaining({ level: 'error', source: 'step-runtime', message: 'model failed', stack })]);
    expect(outgoing).toEqual([{ type: 'BRAIN_RUNTIME_ERROR', pluginId: 'brain', error: returned! }]);
    expect(tNodeResults).toEqual([{
      id: tNodeId,
      result: { error: { message: 'model failed', source: 'brain-llm', phase: 'llm.execute', errorId, stack } },
    }]);
    expect(takeSystemErrors()).toEqual([]);
  });

  it('redacts key-shaped strings a provider error quotes', () => {
    const reported = capture(() => {
      reportError({ error: new Error('Incorrect API key provided: sk-proj-abcdef123456'), source: 'brain-llm', step: { phase: 'llm.execute' } });
    });
    expect(reported.logs).toHaveLength(1);
    expect(JSON.stringify(reported)).not.toContain('sk-proj-abcdef123456');
  });

  it('without step context reports a system error for the app to show', () => {
    const { outgoing } = capture(() => {
      expect(reportError({ error: new Error('boom'), source: 'notes', title: 'Could not save', operation: 'save' })).toBeUndefined();
    });
    expect(takeSystemErrors()).toEqual([{ error: new Error('boom'), source: 'notes', title: 'Could not save', operation: 'save' }]);
    expect(outgoing).toEqual([]);
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
