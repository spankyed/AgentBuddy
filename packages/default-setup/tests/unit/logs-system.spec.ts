// The logs system collects what any code logs, through onLog, and sends each entry to its plugin. It's the
// pack's early system (the app starts it before the others), which the harness's startApp doesn't run, so the
// test starts its machine on the test host.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import { createLogger } from '@abuddy/sdk/logger';
import { testRootEvents } from '@abuddy/sdk/testing';
import type { OutgoingSystemEvents } from '@abuddy/testing/harness';
import logsEntry from '@/features/logs/be/system';

const cleanup: Array<() => void> = [];
afterEach(() => {
  cleanup.splice(0).forEach((stop) => stop());
  vi.restoreAllMocks();
});

describe('logs system', () => {
  it('receives a log entry through onLog and sends it to the logs plugin', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const outgoing: OutgoingSystemEvents[] = [];
    cleanup.push(testRootEvents.onOutgoing((event) => outgoing.push(event)));
    const actor = createActor(logsEntry.machine).start();
    cleanup.push(() => actor.stop());

    createLogger('notes').warn('Note sync is slow', { noteId: 'Note-1' });

    expect(outgoing).toEqual([expect.objectContaining({
      type: 'LOG_ADDED',
      pluginId: 'logs',
      log: expect.objectContaining({ level: 'warn', source: 'notes', message: 'Note sync is slow', meta: { noteId: 'Note-1' } }),
    })]);
    expect(actor.getSnapshot().context.logs).toEqual([expect.objectContaining({ source: 'notes', message: 'Note sync is slow' })]);
  });
});
