// The logs system collects what any code logs, through onLog, and sends each entry to its plugin. It's the
// pack's early system (the app starts it before the others and delivers its messages), which the harness's startApp
// doesn't run, so the test starts its machine on the test host, whose bus is the bound runtime's. Its sends to the
// plugin go through the app's bus, which delivers them once a client is connected.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import { createLogger } from '@abuddy/sdk/logger';
import { testRootEvents } from '@abuddy/sdk/testing';
import type { Message } from '@abuddy/testing/harness';
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
    const toPlugin: Message[] = [];
    cleanup.push(testRootEvents.onPluginSend((event) => toPlugin.push(event)));
    const actor = createActor(logsEntry.machine).start();
    cleanup.push(() => actor.stop());

    createLogger('notes').warn('Note sync is slow', { noteId: 'Note-1' });

    expect(toPlugin).toEqual([{
      to: 'default-setup/logs',
      // The pack that sent it, stamped by this pack's generated broadcastToPlugin
      from: 'default-setup',
      event: expect.objectContaining({
        type: 'LOG_ADDED',
        log: expect.objectContaining({ level: 'warn', source: 'notes', message: 'Note sync is slow', meta: { noteId: 'Note-1' } }),
      }),
    }]);
    expect(actor.getSnapshot().context.logs).toEqual([expect.objectContaining({ source: 'notes', message: 'Note sync is slow' })]);
  });

  // The app starts it before hydration, outside the bus, and checks the sends to it like any system's
  it('is registered as the logs feature\'s early system', () => {
    expect(registration.features?.logs?.system?.early).toBe(true);
    expect(registration.features?.logs?.system?.receives).toContain('CLEAR_LOGS');
  });
});
