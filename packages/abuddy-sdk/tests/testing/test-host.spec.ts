// startTestRuntime's in-memory host: what systems, services and steps call outside the app
import * as os from 'node:os';
import { describe, expect, it } from 'vitest';
import { entityIds, dropAttribute, resetTestData, startTestRuntime, takeSystemErrors, testRootEvents } from '../../src/testing/index.ts';
import { sendToPlugin, sendToSystem, sendToBrainSystem } from '../../src/services/index.ts';
import { appData, traceStore } from '../../src/services/data.ts';
import { registerDesignations, unregisterDesignations } from '../../src/designations/index.ts';
import { reportSystemError, getAppVersion, runMigrations } from '../../src/utils/index.ts';
import * as rpc from '../../src/rpc/index.ts';
import { tx } from '../../src/ears/transaction.ts';
import { getAttr } from '../../src/ears/attribute-storage.ts';

process.env.ABUDDY_ENV ??= 'test';
process.env.ABUDDY_USER_DATA_DIR ??= os.tmpdir();
startTestRuntime();

describe('the test host', () => {
  it('delivers sendToPlugin and sendToSystem on testRootEvents, which rootEvents is', () => {
    const outgoing: unknown[] = [];
    const incoming: unknown[] = [];
    const stop = [testRootEvents.onOutgoing((e) => outgoing.push(e)), testRootEvents.onIncoming((e) => incoming.push(e))];
    registerDesignations({ brain: 'brain-system' });
    try {
      sendToPlugin('memos', { type: 'MEMO_ADDED' });
      sendToSystem('memos', { type: 'ADD_MEMO' });
      sendToBrainSystem({ eventType: 'user.message' });
    } finally {
      stop.forEach((unsubscribe) => unsubscribe());
      unregisterDesignations({ brain: 'brain-system' });
    }
    expect(outgoing).toEqual([{ type: 'MEMO_ADDED', pluginId: 'memos' }]);
    expect(incoming).toEqual([
      { type: 'ADD_MEMO', systemId: 'memos' },
      { type: 'TRIGGER_BRAIN_EVENT', eventType: 'user.message', systemId: 'brain-system' },
    ]);
    expect(rpc.rootEvents).toBe(testRootEvents);
  });

  it('records reported system errors until taken', () => {
    reportSystemError({ error: new Error('boom'), source: 'memos' });
    expect(takeSystemErrors()).toEqual([expect.objectContaining({ source: 'memos' })]);
    expect(takeSystemErrors()).toEqual([]);
  });

  it('has a test version, no-op migrations, an appData that resets the database, and a trace store over it', async () => {
    expect(getAppVersion()).toBe('0.0.0-test');
    expect(() => runMigrations()).not.toThrow();
    const id = tx('Memo' as never).put('text' as never, 'hello' as never).id();
    expect(traceStore.getAttr('text', id)).toBe('hello');
    expect(entityIds()).toContain(id);
    dropAttribute(id, 'text');
    expect(getAttr(id, 'text' as never)).toBeNull();
    await appData.reset();
    expect(entityIds()).toEqual([]);
    await expect(appData.exportBackup('/tmp')).rejects.toThrow("isn't supported in unit tests");
    resetTestData();
  });
});
