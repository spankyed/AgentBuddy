// The counterpart of client-events.spec.ts: a client's event is checked against what a system accepts,
// and a system's event against what the plugin declares it receives. A send nobody declared is reported
// as a system error and dropped, rather than thrown — the caller is a running system.
import { resolveName } from '@abuddy/sdk/ids';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createActor, setup, type AnyActorRef } from 'xstate';
import { startTestRuntime, takeSystemErrors, testRootEvents } from '@abuddy/sdk/testing';
import { onLog } from '@abuddy/sdk/logger';
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
    systems: [{ id: resolveName('memo-pack/memos'), machine, events: new Set(['PING']) }],
    features: [{ id: 'memos', hasSystem: true, hasPlugin: true, services: [] }],
    receivedEventTypes: { memos: ['MEMOS_CONNECTED', 'MEMO_ADDED'] },
  });
  // A pack from before receivedEventTypes existed: it still names its plugins, through `features`
  registry.registerPack({
    id: 'older-pack',
    systems: [{ id: resolveName('older-pack/legacy'), machine, events: new Set(['PING']) }],
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
    await send({ type: 'MEMO_ADDED', pluginId: 'memo-pack/memos', id: 'memo-1' });
    expect(delivered().map((e) => e.type)).toEqual(['MEMO_ADDED']);
    expect(takeSystemErrors()).toEqual([]);
  });

  it('is dropped and reported when the plugin declares no such type', async () => {
    await send({ type: 'MEMO_SHREDDED', pluginId: 'memo-pack/memos' });
    expect(delivered()).toEqual([]);
    const [error] = takeSystemErrors();
    expect(error?.message).toContain('MEMO_SHREDDED');
    expect(error?.message).toContain('memo-pack/memos');
    expect(error?.message).toContain('declares no such event');
  });

  /**
   * Still a SYSTEM_ERROR, so takeSystemErrors fails the pack test that left it — and `diagnostic`, so
   * the app doesn't raise a toast over it. The reader is whoever wrote the send, the message is already
   * in the Logs plugin where they are looking, and the person using the app can do nothing about it.
   */
  it('is reported as a diagnostic, which is recorded and logged but not shown to the user', async () => {
    await send({ type: 'MEMO_SHREDDED', pluginId: 'memo-pack/memos' });
    expect(takeSystemErrors().map((e) => e.severity)).toEqual(['diagnostic']);
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
 * Reporting a drop logs it, and a log event becomes a send to the logs plugin. When that plugin is the
 * one being dropped, reporting a drop produces another droppable send — and the send arrives as a fresh
 * OUTGOING event rather than a nested call, so the cycle grows the actor's queue instead of the call
 * stack. It stops responding rather than overflowing, which is why nothing that reasons about
 * re-entrancy within a transition catches it. The test has to drive a running bus for the same reason.
 */
describe('a drop whose report produces another droppable send', () => {
  it('reports the pair once and settles, rather than feeding itself', async () => {
    // Stands in for default-setup's logs system: every log event becomes a send to the logs plugin,
    // which no pack here declares, so each send is dropped and reporting it logs again.
    const stopRelay = onLog(() => { bus.send({ type: 'OUTGOING', event: { type: 'LOG_ADDED', pluginId: 'default-setup/logs' } }); });
    try {
      await send({ type: 'LOG_ADDED', pluginId: 'default-setup/logs' });
      for (let i = 0; i < 5; i++) await flush();
      const errors = takeSystemErrors().filter((e) => e.message?.includes('default-setup/logs'));
      expect(errors).toHaveLength(1);
    } finally {
      stopRelay();
    }
  });

  it('still reports a different plugin, so deduplication is per pair and not a global mute', async () => {
    await send({ type: 'MEMO_SHREDDED', pluginId: 'memo-pack/memos' });
    expect(takeSystemErrors().map((e) => e.message)).toHaveLength(1);
    // The same pair again is silent; a different type on the same plugin is not
    await send({ type: 'MEMO_SHREDDED', pluginId: 'memo-pack/memos' });
    expect(takeSystemErrors()).toEqual([]);
    await send({ type: 'MEMO_BURNED', pluginId: 'memo-pack/memos' });
    expect(takeSystemErrors()).toHaveLength(1);
  });
});

/**
 * Updating a pack tears it down, downloads the new release, then activates it — so its plugins belong
 * to nobody for as long as the download takes. Sends in that window are still dropped, because there
 * is nothing running to receive them, but they are expected: nothing went wrong.
 */
describe('a plugin whose pack is being replaced', () => {
  it('has its sends dropped without reporting anything', async () => {
    registry.markPackReplacing('memo-pack');
    registry.unregisterPack('memo-pack');

    await send({ type: 'MEMO_ADDED', pluginId: 'memo-pack/memos', id: 'memo-1' });

    expect(delivered()).toEqual([]);
    expect(takeSystemErrors()).toEqual([]);
    // Put it back so afterEach's unregister finds it
    registry.registerPack({
      id: 'memo-pack',
      systems: [{ id: resolveName('memo-pack/memos'), machine, events: new Set(['PING']) }],
      features: [{ id: 'memos', hasSystem: true, hasPlugin: true, services: [] }],
      receivedEventTypes: { memos: ['MEMOS_CONNECTED', 'MEMO_ADDED'] },
    });
  });

  it('reports again once the replacement registers', async () => {
    registry.markPackReplacing('memo-pack');
    expect(registry.isPluginReplacing('memo-pack/memos')).toBe(true);

    // Re-registering is what closes the window, so the same registration is enough to reopen reporting
    registry.unregisterPack('memo-pack');
    registry.registerPack({
      id: 'memo-pack',
      systems: [{ id: resolveName('memo-pack/memos'), machine, events: new Set(['PING']) }],
      features: [{ id: 'memos', hasSystem: true, hasPlugin: true, services: [] }],
      receivedEventTypes: { memos: ['MEMOS_CONNECTED', 'MEMO_ADDED'] },
    });
    expect(registry.isPluginReplacing('memo-pack/memos')).toBe(false);

    await send({ type: 'MEMO_SHREDDED', pluginId: 'memo-pack/memos' });
    expect(takeSystemErrors()).toHaveLength(1);
  });

  // An update whose activation also fails would otherwise leave the window open for the rest of the run
  it('stops being expected when the window is closed with nothing in its place', () => {
    registry.markPackReplacing('memo-pack');
    expect(registry.isPluginReplacing('memo-pack/memos')).toBe(true);
    registry.clearPackReplacing('memo-pack');
    expect(registry.isPluginReplacing('memo-pack/memos')).toBe(false);
  });
});

/**
 * A pack built before `receivedEventTypes` existed declares none, and the app can't check its sends
 * against anything. Dropping them would leave the pack installed and inert, and its user can't rebuild
 * it — so its sends pass, and only packs that declare are checked.
 */
describe('a pack that declared no event types', () => {
  it('has its sends delivered rather than dropped', async () => {
    await send({ type: 'ANYTHING_AT_ALL', pluginId: 'older-pack/legacy' });
    expect(delivered().map((e) => e.type)).toEqual(['ANYTHING_AT_ALL']);
    expect(takeSystemErrors()).toEqual([]);
  });

  it('does not make an unknown plugin id pass too', async () => {
    await send({ type: 'ANYTHING_AT_ALL', pluginId: 'not-a-plugin' });
    expect(delivered()).toEqual([]);
    expect(takeSystemErrors()[0]?.message).toContain('no registered pack declares');
  });
});
