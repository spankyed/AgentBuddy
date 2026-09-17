// services.emitter.sendToSystem names systems <packId>/<featureId>, since actions run outside any pack: the host's
// bound pack registry resolves the name to the id the system runs under
import * as os from 'node:os';
import { describe, expect, it } from 'vitest';
import { services } from '../../src/services/index.ts';
import { startTestRuntime, testRootEvents } from '../../src/testing/index.ts';
import { testPacksView } from '../../src/testing/packs.ts';

process.env.ABUDDY_ENV ??= 'test';
process.env.ABUDDY_USER_DATA_DIR ??= os.tmpdir();
const running: Record<string, string> = { 'default-setup/notes': 'notes', 'ext/notes': 'ext.notes' };
startTestRuntime({
  packs: { ...testPacksView(), resolveSystemAddress: (address) => running[address] },
});

function incoming(send: () => void): unknown[] {
  const received: unknown[] = [];
  const stop = testRootEvents.onIncoming((event) => received.push(event));
  try {
    send();
  } finally {
    stop();
  }
  return received;
}

describe('services.emitter.sendToSystem', () => {
  it('sends to the system a <packId>/<featureId> name resolves to', () => {
    expect(incoming(() => {
      services.emitter.sendToSystem('default-setup/notes', { type: 'GET_NOTES' });
      services.emitter.sendToSystem('ext/notes', { type: 'GET_NOTES' });
    })).toEqual([{ type: 'GET_NOTES', systemId: 'notes' }, { type: 'GET_NOTES', systemId: 'ext.notes' }]);
  });

  it("throws for a name no running system has, sending nothing", () => {
    expect(incoming(() => {
      expect(() => services.emitter.sendToSystem('notes', { type: 'GET_NOTES' })).toThrow('No running system is named "notes"');
    })).toEqual([]);
  });
});
