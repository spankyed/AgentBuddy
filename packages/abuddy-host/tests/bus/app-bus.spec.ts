// The app's bus on the SDK's bound root event bus (the test host's here): a connecting client reaches the
// registered systems, except those of a loaded pack with frontend code, which wait for the client to load it.
import { resolveName } from '@abuddy/sdk/ids';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createActor, setup, type AnyActorRef } from 'xstate';
import { startTestRuntime, testRootEvents } from '@abuddy/sdk/testing';
import type { Message } from '@abuddy/sdk/events';
import { createAppBus } from '../../src/bus/index.ts';
import { appState, HOST_ENTITY_TYPES } from '../../src/app-state/index.ts';
import { createPackRegistry } from '../../src/packs/pack-registration.ts';

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
  registerPack({ id, systems: [{ id: resolveName(`${id}/feature`), machine: recorder(id), events: new Set(['CLIENT_CONNECTED']) }] });
}

let bus: AnyActorRef;
let packDir: string;
const outgoing: Message[] = [];
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
  registry.registerPack({ id: 'fe-pack-fe', systems: [] }, {
    id: 'fe-pack', name: 'fe-pack', version: '1.0.0', dir: packDir, builtIn: false,
    manifest: { id: 'fe-pack', name: 'fe-pack', version: '1.0.0' } as never,
  });
  bus = createActor(createAppBus(registry), { systemId: 'host/bus' }).start();
});

afterEach(() => {
  bus.stop();
  stopOutgoing();
  for (const id of ['local-pack', 'fe-pack']) unregisterPack(id);
  unregisterPack('fe-pack-fe');
  fs.rmSync(packDir, { recursive: true, force: true });
});

describe('createAppBus', () => {
  // The window opens with the shell's state: which plugins' tabs show and the plugin the user last had open
  it("tells the application plugin, on each connection, the tabs' visibility and the plugin last open", async () => {
    appState.update({ pluginVisibility: { 'local-pack/feature': false }, lastActivePlugin: 'local-pack/feature' });

    testRootEvents.emitConnected();
    await flush();

    expect(outgoing).toContainEqual({
      to: 'host/application',
      event: { type: 'CLIENT_CONNECTED', hasOnboarded: true, pluginVisibility: { 'local-pack/feature': false }, lastActivePlugin: 'local-pack/feature' },
    });
  });

  it("reaches the registered systems when a client connects, and a frontend pack's once the client loaded it", async () => {
    testRootEvents.emitConnected();
    await flush();
    expect(received).toEqual(['local-pack']);
    expect(outgoing).toContainEqual({ to: 'host/application', event: expect.objectContaining({ type: 'CLIENT_CONNECTED', hasOnboarded: true }) });

    testRootEvents.emitPackClientConnected('fe-pack');
    await flush();
    expect(received).toEqual(['local-pack', 'fe-pack']);
  });

  it('routes a client event to the system it names', async () => {
    const pings: string[] = [];
    registerPack({
      id: 'ping-pack',
      systems: [{ id: resolveName('ping-pack/feature'), machine: setup({}).createMachine({ on: { PING: { actions: () => pings.push('ping') } } }), events: new Set(['PING']) }],
      // The bus drops a send to a plugin that declares no such event, so this case declares the two it sends
      receivedEventTypes: { feature: ['EARLY', 'LATE'] },
    });
    try {
      bus.stop();
      bus = createActor(createAppBus(registry), { systemId: 'host/bus' }).start();
      testRootEvents.emitConnected();
      testRootEvents.emitIncoming({ to: 'ping-pack/feature', event: { type: 'PING' } });
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
      systems: [{ id: resolveName('ping-pack/feature'), machine: setup({}).createMachine({ on: { PING: { actions: () => pings.push('ping') } } }), events: new Set(['PING']) }],
      // The bus drops a send to a plugin that declares no such event, so this case declares the two it sends
      receivedEventTypes: { feature: ['EARLY', 'LATE'] },
    });
    try {
      bus.stop();
      bus = createActor(createAppBus(registry), { systemId: 'host/bus' }).start();
      // A schedule tick or a `fire` step at boot, with no window open yet
      testRootEvents.emitIncoming({ to: 'ping-pack/feature', event: { type: 'PING' } });
      testRootEvents.emitPluginSend({ to: 'ping-pack/feature', event: { type: 'EARLY' } });
      await flush();
      expect(pings).toEqual(['ping']);
      expect(outgoing).toEqual([]);

      testRootEvents.emitConnected();
      testRootEvents.emitPluginSend({ to: 'ping-pack/feature', event: { type: 'LATE' } });
      await flush();
      expect(outgoing.map(({ event }) => event.type)).toContain('LATE');
      expect(outgoing.map(({ event }) => event.type)).not.toContain('EARLY');
    } finally {
      unregisterPack('ping-pack');
    }
  });
});
