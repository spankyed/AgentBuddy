// The app's bus on the SDK's bound root event bus (the test host's here): a connecting client reaches the
// registered systems, except those of a loaded pack with frontend code, which wait for the client to load it.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createActor, setup, type AnyActorRef } from 'xstate';
import { startTestRuntime, testRootEvents } from '@abuddy/sdk/testing';
import type { OutgoingSystemEvents } from '@abuddy/sdk/events';
import { createAppBus } from '../../src/bus/index.ts';
import { appState, HOST_ENTITY_TYPES } from '../../src/app-state/index.ts';
import { createPackRegistry } from '../../src/packs/pack-registration.ts';
import { removeLoadedPack, updateLoadedPack, type LoadedPack } from '../../src/packs/runtime/loaded-packs.ts';

const registry = createPackRegistry();
const { registerPack, unregisterPack } = registry;
startTestRuntime({ entityTypes: HOST_ENTITY_TYPES, packs: registry });
// The app's state, which the application plugin's CLIENT_CONNECTED reports
appState.update({ hasOnboarded: true });

const received: string[] = [];

/** A system that records each CLIENT_CONNECTED it receives */
function recorder(label: string) {
  return setup({}).createMachine({
    on: { CLIENT_CONNECTED: { actions: () => received.push(label) } },
  });
}

function registerRecorderPack(id: string) {
  registerPack({ id, systems: [{ id: `${id}.feature`, machine: recorder(id), events: new Set(['CLIENT_CONNECTED']) }] });
}

let bus: AnyActorRef;
let packDir: string;
const outgoing: OutgoingSystemEvents[] = [];
let stopOutgoing: () => void;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  received.length = 0;
  outgoing.length = 0;
  stopOutgoing = testRootEvents.onOutgoing((event) => { outgoing.push(event); });
  registerRecorderPack('local-pack');
  registerRecorderPack('fe-pack');
  // fe-pack is a loaded external pack whose bundle has frontend code
  packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-bus-'));
  fs.mkdirSync(path.join(packDir, 'runtime'));
  fs.writeFileSync(path.join(packDir, 'runtime', 'fe.js'), '');
  updateLoadedPack({ manifest: { id: 'fe-pack', name: 'fe-pack', version: '1.0.0' }, dir: packDir, systems: new Map() } as unknown as LoadedPack);
  bus = createActor(createAppBus(registry), { systemId: 'bus' }).start();
});

afterEach(() => {
  bus.stop();
  stopOutgoing();
  for (const id of ['local-pack', 'fe-pack']) unregisterPack(id);
  removeLoadedPack('fe-pack');
  fs.rmSync(packDir, { recursive: true, force: true });
});

describe('createAppBus', () => {
  it("reaches the registered systems when a client connects, and a frontend pack's once the client loaded it", async () => {
    testRootEvents.emitConnected();
    await flush();
    expect(received).toEqual(['local-pack']);
    expect(outgoing).toContainEqual({ type: 'CLIENT_CONNECTED', hasOnboarded: true, pluginId: 'application' });

    testRootEvents.emitPackClientConnected('fe-pack');
    await flush();
    expect(received).toEqual(['local-pack', 'fe-pack']);
  });

  it('routes a client event to the system it names', async () => {
    const pings: string[] = [];
    registerPack({
      id: 'ping-pack',
      systems: [{ id: 'ping-pack.feature', machine: setup({}).createMachine({ on: { PING: { actions: () => pings.push('ping') } } }), events: new Set(['PING']) }],
      // The bus drops a send to a plugin that declares no such event, so this case declares the two it sends
      receivedEventTypes: { 'ping-pack': ['EARLY', 'LATE'] },
    });
    try {
      bus.stop();
      bus = createActor(createAppBus(registry), { systemId: 'bus' }).start();
      testRootEvents.emitConnected();
      testRootEvents.emitIncoming({ type: 'PING', systemId: 'ping-pack.feature' });
      await flush();
      expect(pings).toEqual(['ping']);
    } finally {
      unregisterPack('ping-pack');
    }
  });

  it('routes events to systems before any client connects, and holds back sends to plugins until one does', async () => {
    const pings: string[] = [];
    registerPack({
      id: 'ping-pack',
      systems: [{ id: 'ping-pack.feature', machine: setup({}).createMachine({ on: { PING: { actions: () => pings.push('ping') } } }), events: new Set(['PING']) }],
      // The bus drops a send to a plugin that declares no such event, so this case declares the two it sends
      receivedEventTypes: { 'ping-pack': ['EARLY', 'LATE'] },
    });
    try {
      bus.stop();
      bus = createActor(createAppBus(registry), { systemId: 'bus' }).start();
      // A schedule tick or a `fire` step at boot, with no window open yet
      testRootEvents.emitIncoming({ type: 'PING', systemId: 'ping-pack.feature' });
      testRootEvents.emitPluginSend({ type: 'EARLY', pluginId: 'ping-pack' });
      await flush();
      expect(pings).toEqual(['ping']);
      expect(outgoing).toEqual([]);

      testRootEvents.emitConnected();
      testRootEvents.emitPluginSend({ type: 'LATE', pluginId: 'ping-pack' });
      await flush();
      expect(outgoing.map((event) => event.type)).toContain('LATE');
      expect(outgoing.map((event) => event.type)).not.toContain('EARLY');
    } finally {
      unregisterPack('ping-pack');
    }
  });
});
