// Who hears the outcome of a settings write, which is the one branch the change rests on.
//
// `SETTINGS_SAVED` and `SETTINGS_REFUSED` were only ever broadcast to the `settings` plugin, so a sender that
// was not that plugin learned nothing — a drive session's `/set-setting` reported success for every refused
// write, because the send had been accepted and the refusal went somewhere it could not see.
//
// **Tested here rather than through `startApp`, and that is the finding as much as the fix.** A case that
// drove the real system passed with the reply deleted, twice over: the harness resolves a `sender` against
// registered systems, so a driver's ref cannot be named at all, and naming the Settings plugin instead makes
// reply and broadcast arrive at the same place. A branch whose two arms are indistinguishable to the only
// instrument pointed at it is a branch nothing is watching.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _runDelivery } from '@abuddy/sdk/events';
import { startTestRuntime, testRootEvents } from '@abuddy/sdk/testing';
import { HOST_ENTITY_TYPES } from '../../../src/app-state/index.ts';
import { createPackRegistry } from '../../../src/packs/registry.ts';
import { answerSettings } from '../../../src/features/settings/be/answer.ts';

startTestRuntime({ entityTypes: HOST_ENTITY_TYPES, packs: createPackRegistry() });

/** Every message the bus would have carried, which is where both arms end up and so where they are told apart */
let sent: Array<{ to?: string; type: string }>;
/** Dropped after each case: the bus is shared, so a listener left behind records the next case's sends too */
let stopListening: () => void;

beforeEach(() => {
  sent = [];
  stopListening = testRootEvents.onPluginSend((message) => { sent.push({ to: message.to, type: message.event.type }); });
});

afterEach(() => stopListening());

/** The ref a drive session claims on its connection — a participant, which is deliberately not a plugin */
const DRIVER = 'host/drive';

describe('the outcome of a settings write', () => {
  it('goes to whoever asked, when the message named a sender', () => {
    _runDelivery({ receiver: 'host/settings', replyTo: DRIVER, client: 'c-1' }, () => {
      answerSettings({ type: 'SETTINGS_SAVED', requestId: 's-1' });
    });

    expect(sent).toEqual([{ to: DRIVER, type: 'SETTINGS_SAVED' }]);
  });

  it('carries a refusal the same way, which is the case the round trip exists for', () => {
    _runDelivery({ receiver: 'host/settings', replyTo: DRIVER, client: 'c-1' }, () => {
      answerSettings({ type: 'SETTINGS_REFUSED', problems: ['nope'], requestId: 's-2' });
    });

    expect(sent).toEqual([{ to: DRIVER, type: 'SETTINGS_REFUSED' }]);
  });

  /**
   * The fallback, and the reason it is reply-*or*-broadcast rather than reply-*and*-broadcast.
   *
   * A write can arrive from code with no delivery in scope at all — a seeder, a migration, a timer — and
   * `reply()` throws for one of those. The Settings view has to hear it either way, so the broadcast stays as
   * the answer for an ask that named nobody.
   */
  it('tells every Settings view when nothing is being handled at all', () => {
    answerSettings({ type: 'SETTINGS_SAVED' });

    expect(sent).toEqual([{ to: 'host/settings', type: 'SETTINGS_SAVED' }]);
  });

  // A delivery that named no sender is the same case: there is nobody to answer, and `reply` would throw
  it('tells every Settings view when the message being handled named no sender', () => {
    _runDelivery({ receiver: 'host/settings' }, () => {
      answerSettings({ type: 'SETTINGS_SAVED' });
    });

    expect(sent).toEqual([{ to: 'host/settings', type: 'SETTINGS_SAVED' }]);
  });
});
