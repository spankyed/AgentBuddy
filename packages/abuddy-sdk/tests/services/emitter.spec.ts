// services.emitter names systems and plugins `<packId>/<featureId>`, since actions run outside any pack; a bare
// name is the host's. Both sends resolve against what the bound registry has registered, and a name nothing is
// registered under throws at the call, naming the form to write — rather than being dropped by the bus.
import * as os from 'node:os';
import { describe, expect, it } from 'vitest';
import { services } from '../../src/services/index.ts';
import { startTestRuntime, testRootEvents } from '../../src/testing/index.ts';
import { testPacksView } from '../../src/testing/packs.ts';
import { asHostAddress, resolveName } from '../../src/ids/index.ts';

process.env.ABUDDY_ENV ??= 'test';
process.env.ABUDDY_USER_DATA_DIR ??= os.tmpdir();
startTestRuntime({
  packs: {
    ...testPacksView(),
    systemIds: () => [resolveName('default-setup/notes'), resolveName('ext/notes'), asHostAddress('packs')],
    pluginIds: () => [resolveName('default-setup/threads'), asHostAddress('application')],
  },
});

function sent(send: () => void): unknown[] {
  const received: unknown[] = [];
  const stops = [testRootEvents.onIncoming((event) => received.push(event)), testRootEvents.onPluginSend((event) => received.push(event))];
  try {
    send();
  } finally {
    stops.forEach((stop) => stop());
  }
  return received;
}

describe('services.emitter', () => {
  it('sends to the system a <packId>/<featureId> name resolves to', () => {
    expect(sent(() => {
      services.emitter.sendToSystem('default-setup/notes', { type: 'GET_NOTES' });
      services.emitter.sendToSystem('ext/notes', { type: 'GET_NOTES' });
    })).toEqual([{ type: 'GET_NOTES', systemId: 'default-setup/notes' }, { type: 'GET_NOTES', systemId: 'ext/notes' }]);
  });

  it('sends to the plugin a <packId>/<featureId> name resolves to, and to a host plugin by its bare id', () => {
    expect(sent(() => {
      services.emitter.sendToPlugin('default-setup/threads', { type: 'SET_PHASE', phase: 'Edit' });
      services.emitter.sendToPlugin('application', { type: 'APPLICATION_HOTKEYS', hotkeys: {} });
    })).toEqual([
      { type: 'SET_PHASE', phase: 'Edit', pluginId: 'default-setup/threads' },
      { type: 'APPLICATION_HOTKEYS', hotkeys: {}, pluginId: 'application' },
    ]);
  });

  // The documented form before plugins were addressed per pack: an action a user wrote then still says this
  it('throws for a bare feature name, naming the pack it most likely means, and sends nothing', () => {
    expect(sent(() => {
      expect(() => services.emitter.sendToPlugin('threads', { type: 'SET_PHASE', phase: 'Edit' }))
        .toThrow('No registered plugin is named "threads": actions name a plugin "<packId>/<featureId>" — did you mean "default-setup/threads"?');
      expect(() => services.emitter.sendToSystem('notes', { type: 'GET_NOTES' }))
        .toThrow('No registered system is named "notes": actions name a system "<packId>/<featureId>"');
    })).toEqual([]);
  });

  it('throws for a name no pack registered', () => {
    expect(() => services.emitter.sendToPlugin('ext/threads', { type: 'X' })).toThrow('No registered plugin is named "ext/threads"');
    expect(() => services.emitter.sendToSystem('other/notes', { type: 'X' })).toThrow('No registered system is named "other/notes"');
  });
});
