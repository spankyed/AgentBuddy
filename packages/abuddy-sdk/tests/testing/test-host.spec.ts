// startTestRuntime's in-memory app: what systems, services and steps call outside the app
import { installedEngine as ears } from '@abuddy/ears';
import * as os from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { entityIds, dropAttribute, resetTestData, startTestRuntime, takeSystemErrors, testRootEvents } from '../../src/testing/index.ts';
import { sendToPlugin, sendToSystem } from '../../src/events/index.ts';
import { services } from '../../src/services/index.ts';
import { testPacks, testPacksView } from '../../src/testing/packs.ts';
import { getAppVersion } from '../../src/env/index.ts';
import { createLogger, reportError } from '../../src/logger/index.ts';
import { boundHost, unbindHost } from '../../src/runtime/host-runtime.ts';
import { _rootEvents } from '../../src/runtime/root-events.ts';
import { registerRepository, repository, tx } from '@abuddy/ears';

process.env.ABUDDY_ENV ??= 'test';
process.env.ABUDDY_USER_DATA_DIR ??= os.tmpdir();
startTestRuntime();

describe('the test host', () => {
  it('binds testRootEvents as the bus sendToPlugin and sendToSystem send on, which _rootEvents is', () => {
    const toPlugins: unknown[] = [];
    const incoming: unknown[] = [];
    const stop = [testRootEvents.onPluginSend((e) => toPlugins.push(e)), testRootEvents.onIncoming((e) => incoming.push(e))];
    testPacks.designations.set('brain', 'brain-system');
    try {
      sendToPlugin('memos', { type: 'MEMO_ADDED' });
      sendToSystem('memos', { type: 'ADD_MEMO' });
      sendToSystem({ role: 'brain' }, { type: 'TRIGGER_BRAIN_EVENT', eventType: 'user.message' });
      _rootEvents.emitIncoming({ to: 'memos', event: { type: 'PING' } });
    } finally {
      stop.forEach((unsubscribe) => unsubscribe());
      testPacks.designations.delete('brain');
    }
    expect(toPlugins).toEqual([{ to: 'memos', event: { type: 'MEMO_ADDED' } }]);
    expect(incoming).toEqual([
      { to: 'memos', event: { type: 'ADD_MEMO' } },
      { to: 'brain-system', event: { type: 'TRIGGER_BRAIN_EVENT', eventType: 'user.message' } },
      { to: 'memos', event: { type: 'PING' } },
    ]);
    expect(boundHost().transport.rootEvents).toBe(testRootEvents);
  });

  it('records the SYSTEM_ERROR events systems report until taken', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    reportError({ error: new Error('boom'), source: 'memos' });
    expect(takeSystemErrors()).toEqual([expect.objectContaining({ type: 'SYSTEM_ERROR', source: 'memos', message: 'boom' })]);
    expect(takeSystemErrors()).toEqual([]);
    vi.restoreAllMocks();
  });

  it('prints the log events on its bus once each, as the app does', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    createLogger('memos').info('saved', { id: 1 });
    testRootEvents.emitLog({ level: 'info', message: 'from the bus' });
    expect(info.mock.calls).toEqual([['[memos]', 'saved', { id: 1 }], ['[test]', 'from the bus']]);
    vi.restoreAllMocks();
  });

  it('has a test version, the engine, an appData that resets the database, and a trace store over it', async () => {
    expect(getAppVersion()).toBe('0.0.0-test');
    expect(services.repository).toBe(ears().repository);
    registerRepository('memoQueries', { all: () => [] });
    const id = tx('Memo' as never).put('text' as never, 'hello' as never).id();
    expect(services.traceStore.getAttr('text', id)).toBe('hello');
    expect(entityIds()).toContain(id);
    dropAttribute(id, 'text');
    expect(ears().getAttr(id, 'text' as never)).toBeNull();
    const before = ears();
    await services.appData.reset();
    expect(entityIds()).toEqual([]);
    // A reset replaces the engine, keeping the registered repositories
    expect(ears()).not.toBe(before);
    expect(services.repository).toBe(ears().repository);
    expect(repository.memoQueries).toBe(before.repository.memoQueries);
    expect(before.getAllEntities()).toContain(id);
    await expect(services.appData.exportBackup('/tmp')).rejects.toThrow("isn't supported in unit tests");
    resetTestData();
  });

  it('keeps the packs and version it was first started with', () => {
    expect(() => startTestRuntime({ entityTypes: ['Memo'] })).not.toThrow();
    expect(() => startTestRuntime({ appVersion: '2.0.0' })).toThrow('pass appVersion on its first call');
    expect(() => startTestRuntime({ packs: testPacksView() }))
      .toThrow('pass packs on its first call');
    expect(() => startTestRuntime({ onboarding: { hasOnboarded: () => true, completeOnboarding: () => {} } }))
      .toThrow('pass onboarding on its first call');
  });

  it('binds the test app again once a test unbound it, printing each log event still once', () => {
    unbindHost();
    expect(() => ears()).toThrow();

    startTestRuntime();

    expect(boundHost().transport.rootEvents).toBe(testRootEvents);
    expect(entityIds()).toEqual([]);
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    createLogger('memos').info('once');
    expect(info).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it('keeps whether the user onboarded in memory by default, until the database is emptied', () => {
    expect(services.appData.hasOnboarded()).toBe(false);
    services.appData.completeOnboarding();
    expect(services.appData.hasOnboarded()).toBe(true);
    resetTestData();
    expect(services.appData.hasOnboarded()).toBe(false);
  });
});
