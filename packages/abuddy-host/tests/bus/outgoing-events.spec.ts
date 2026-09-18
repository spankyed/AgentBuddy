// The counterpart of client-events.spec.ts: a client's event is checked against what a system accepts,
// and a system's event against what the plugin declares it receives. A send nobody declared is reported
// as a system error and dropped, rather than thrown — the caller is a running system.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createActor, setup, type AnyActorRef } from 'xstate';
import { startTestRuntime, takeSystemErrors, testRootEvents } from '@abuddy/sdk/testing';
import type { OutgoingSystemEvents } from '@abuddy/sdk/events';
import { createAppBus } from '../../src/bus/index.ts';
import { HOST_ENTITY_TYPES } from '../../src/app-state/index.ts';
import { createPackRegistry } from '../../src/packs/pack-registration.ts';
import { PACKS_PLUGIN_EVENT_TYPES } from '../../src/packs/runtime/packs-system.ts';

const registry = createPackRegistry();
startTestRuntime({ entityTypes: HOST_ENTITY_TYPES, packs: registry });

const machine = setup({}).createMachine({});

let bus: AnyActorRef;
const outgoing: OutgoingSystemEvents[] = [];
/** What reached a plugin, less the SYSTEM_ERROR events reportError sends there itself */
const delivered = () => outgoing.filter((e) => e.type !== 'SYSTEM_ERROR' && e.type !== 'CLIENT_CONNECTED');
let stopOutgoing: () => void;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Sends to a plugin are dropped until a client connects, so every case connects first */
async function connect(): Promise<void> {
  testRootEvents.emitConnected();
  await flush();
}

async function send(event: OutgoingSystemEvents): Promise<void> {
  bus.send({ type: 'OUTGOING', event });
  await flush();
}

beforeEach(async () => {
  outgoing.length = 0;
  stopOutgoing = testRootEvents.onOutgoing((event) => { outgoing.push(event); });
  registry.registerPack({
    id: 'memo-pack',
    systems: [{ id: 'memo-pack.memos', machine, events: new Set(['PING']) }],
    features: [{ id: 'memos', hasSystem: true, hasPlugin: true, services: [] }],
    receivedEventTypes: { memos: ['MEMOS_CONNECTED', 'MEMO_ADDED'] },
  });
  // A pack from before receivedEventTypes existed: it still names its plugins, through `features`
  registry.registerPack({
    id: 'older-pack',
    systems: [{ id: 'older-pack.legacy', machine, events: new Set(['PING']) }],
    features: [{ id: 'legacy', hasSystem: true, hasPlugin: true, services: [] }],
  });
  registry.registerHostPlugin('packs', PACKS_PLUGIN_EVENT_TYPES);
  bus = createActor(createAppBus(registry), { systemId: 'bus' }).start();
  await connect();
});

afterEach(() => {
  bus.stop();
  stopOutgoing();
  registry.unregisterPack('memo-pack');
  registry.unregisterPack('older-pack');
  takeSystemErrors();
});

describe('an event a system sends to a plugin', () => {
  it('is delivered when the plugin declares it', async () => {
    await send({ type: 'MEMO_ADDED', pluginId: 'memos', id: 'memo-1' });
    expect(delivered().map((e) => e.type)).toEqual(['MEMO_ADDED']);
    expect(takeSystemErrors()).toEqual([]);
  });

  it('is dropped and reported when the plugin declares no such type', async () => {
    await send({ type: 'MEMO_SHREDDED', pluginId: 'memos' });
    expect(delivered()).toEqual([]);
    const [error] = takeSystemErrors();
    expect(error?.message).toContain('MEMO_SHREDDED');
    expect(error?.message).toContain('memos');
    expect(error?.message).toContain('declares no such event');
  });

  // The case the notes bug's neighbours live in: a plugin id nothing registered declares
  it('is dropped and reported when no pack declares that plugin at all', async () => {
    await send({ type: 'MEMO_ADDED', pluginId: 'ghost' });
    expect(delivered()).toEqual([]);
    const [error] = takeSystemErrors();
    expect(error?.message).toContain('ghost');
    expect(error?.message).toContain('no registered pack declares');
  });

  it("delivers to a host plugin, whose types the host declares and no pack widens", async () => {
    await send({ type: 'APPLICATION_HOTKEYS', pluginId: 'application', hotkeys: {} });
    expect(delivered().map((e) => e.type)).toContain('APPLICATION_HOTKEYS');
    expect(takeSystemErrors()).toEqual([]);
  });

  it('drops an event a host plugin does not declare, so the host is checked like a pack', async () => {
    await send({ type: 'APPLICATION_EXPLODE', pluginId: 'application' });
    expect(delivered().map((e) => e.type)).not.toContain('APPLICATION_EXPLODE');
    expect(takeSystemErrors()[0]?.message).toContain('APPLICATION_EXPLODE');
  });

  // The packs view is driven entirely by a host system's sends. Checking sends without declaring the
  // host's own plugins dropped every one of them, and the view stopped updating.
  it("delivers the packs system's sends to the packs plugin", async () => {
    await send({ type: 'PACKS_LIST', pluginId: 'packs', packs: [] });
    expect(delivered().map((e) => e.type)).toEqual(['PACKS_LIST']);
    expect(takeSystemErrors()).toEqual([]);
  });
});

/**
 * A pack built before `receivedEventTypes` existed declares none, and the app can't check its sends
 * against anything. Dropping them would leave the pack installed and inert, and its user can't rebuild
 * it — so its sends pass, and only packs that declare are checked.
 */
describe('a pack that declared no event types', () => {
  it('has its sends delivered rather than dropped', async () => {
    await send({ type: 'ANYTHING_AT_ALL', pluginId: 'legacy' });
    expect(delivered().map((e) => e.type)).toEqual(['ANYTHING_AT_ALL']);
    expect(takeSystemErrors()).toEqual([]);
  });

  it('does not make an unknown plugin id pass too', async () => {
    await send({ type: 'ANYTHING_AT_ALL', pluginId: 'not-a-plugin' });
    expect(delivered()).toEqual([]);
    expect(takeSystemErrors()[0]?.message).toContain('no registered pack declares');
  });
});
