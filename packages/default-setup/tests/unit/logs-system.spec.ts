// The logs system collects what any code logs, through onLog, and sends each entry to its plugin. It's the
// pack's early system (the app starts it before the others), which the harness's startApp doesn't run, so the
// test starts its machine on the test host, whose bus is the bound runtime's. Its sends to the plugin go through the
// app's bus, which delivers them once a client is connected.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import { createLogger } from '@abuddy/sdk/logger';
import { testRootEvents } from '@abuddy/sdk/testing';
import type { OutgoingSystemEvents } from '@abuddy/testing/harness';
import logsEntry from '@/features/logs/be/system';
import { registration } from '@/__generated__/pack-entry';

const cleanup: Array<() => void> = [];
afterEach(() => {
  cleanup.splice(0).forEach((stop) => stop());
  vi.restoreAllMocks();
});

describe('logs system', () => {
  it('receives a log entry through onLog and sends it to the logs plugin', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const toPlugin: OutgoingSystemEvents[] = [];
    cleanup.push(testRootEvents.onPluginSend((event) => toPlugin.push(event)));
    const actor = createActor(logsEntry.machine).start();
    cleanup.push(() => actor.stop());

    createLogger('notes').warn('Note sync is slow', { noteId: 'Note-1' });

    expect(toPlugin).toEqual([expect.objectContaining({
      type: 'LOG_ADDED',
      pluginId: 'default-setup/logs',
      log: expect.objectContaining({ level: 'warn', source: 'notes', message: 'Note sync is slow', meta: { noteId: 'Note-1' } }),
    })]);
    expect(actor.getSnapshot().context.logs).toEqual([expect.objectContaining({ source: 'notes', message: 'Note sync is slow' })]);
  });

  // The Logs plugin's Clear and refresh are client sends to this system's address, which only its own
  // subscription hears: the bus doesn't run an early system
  it('hears the sends to its address, and only those', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const actor = createActor(logsEntry.machine).start();
    cleanup.push(() => actor.stop());
    createLogger('notes').warn('Note sync is slow');

    testRootEvents.emitIncoming({ type: 'CLEAR_LOGS', systemId: 'logs' });
    expect(actor.getSnapshot().context.logs).toHaveLength(1);

    testRootEvents.emitIncoming({ type: 'CLEAR_LOGS', systemId: 'default-setup/logs' });
    expect(actor.getSnapshot().context.logs).toEqual([]);
  });

  it('is registered at its address', () => {
    expect(registration.boot?.earlySystem?.id).toBe('default-setup/logs');
    expect(registration.boot?.earlySystem?.events).toContain('CLEAR_LOGS');
  });
});
