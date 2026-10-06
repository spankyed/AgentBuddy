// Who hears the outcome of a settings write, which is the one branch the change rests on.
//
// `SETTINGS_SAVED` and `SETTINGS_REFUSED` were only ever broadcast to the `settings` plugin, so a sender that
// was not that plugin learned nothing — a drive session's `/set-setting` reported success for every refused
// write, because the send had been accepted and the refusal went somewhere it could not see.
//
// **It takes the answer rather than finding one**, which is what the cases below are able to be so plain
// about. While it read the delivery in scope, this could not be driven through `startApp` at all: the harness
// resolves a `sender` against registered systems, so a driver's ref cannot be named there, and naming the
// Settings plugin instead makes a reply and a broadcast arrive at the same place — measured, a case that drove
// the real system passed with the reply deleted. Passing `reply` in makes the two arms ordinary arguments.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Reply } from '@abuddy/sdk/events';
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
const toTheDriver: Reply = (event) => { sent.push({ to: DRIVER, type: event.type }); };

describe('the outcome of a settings write', () => {
  it('goes to whoever asked, when there is an answer to give', () => {
    answerSettings(toTheDriver, { type: 'SETTINGS_SAVED', requestId: 's-1' });

    expect(sent).toEqual([{ to: DRIVER, type: 'SETTINGS_SAVED' }]);
  });

  it('carries a refusal the same way, which is the case the round trip exists for', () => {
    answerSettings(toTheDriver, { type: 'SETTINGS_REFUSED', problems: ['nope'], requestId: 's-2' });

    expect(sent).toEqual([{ to: DRIVER, type: 'SETTINGS_REFUSED' }]);
  });

  /**
   * The fallback, and the reason it is reply-*or*-broadcast rather than reply-*and*-broadcast.
   *
   * A write can arrive from code nobody asked on behalf of — a seeder, a migration, a timer. The Settings view
   * has to hear it either way, so the broadcast stays as the answer for an ask that named nobody.
   */
  it('tells every Settings view when nobody asked', () => {
    answerSettings(undefined, { type: 'SETTINGS_SAVED' });

    expect(sent).toEqual([{ to: 'host/settings', type: 'SETTINGS_SAVED' }]);
  });

  // Never both: the Settings view would otherwise see two saves for one write
  it('does not also broadcast when it answered the asker', () => {
    answerSettings(toTheDriver, { type: 'SETTINGS_SAVED' });

    expect(sent.filter((m) => m.to === 'host/settings')).toEqual([]);
  });
});
