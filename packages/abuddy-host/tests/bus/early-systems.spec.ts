// An early system (`system.early`, the built-in pack's logs) starts before hydration, outside the bus. The host
// delivers it what the bus delivers every other system: the messages sent to its ref, and each client connection.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { defineHandlers } from '@abuddy/sdk/framework';
import { createActor, setup, type AnyActorRef, type AnyEventObject, type MachineContext } from 'xstate';
import { startTestRuntime, testRootEvents } from '@abuddy/sdk/testing';
import { untypedBroadcastToPlugin, type Message } from '@abuddy/sdk/events';
import { createAppBus, startEarlySystems } from '../../src/bus/index.ts';
import { HOST_ENTITY_TYPES } from '../../src/app-state/index.ts';
import { createPackRegistry } from '../../src/packs/registry.ts';

const registry = createPackRegistry();
startTestRuntime({ entityTypes: HOST_ENTITY_TYPES, packs: registry });

const heard: Array<{ system: string; type: string }> = [];
/** A system that records every event it receives */
const recorder = (system: string) => setup({}).createMachine({ on: { '*': { actions: ({ event }) => heard.push({ system, type: event.type }) } } });

let early: ReturnType<typeof startEarlySystems>;
let bus: AnyActorRef;

beforeEach(() => {
  heard.length = 0;
  registry.registerPack({
    id: 'log-pack',
    features: {
      journal: { system: { machine: recorder('journal'), receives: ['CLEAR'], early: true } },
      notes: { system: { machine: recorder('notes'), receives: ['CLEAR'] } },
    },
  });
  early = startEarlySystems(registry);
  bus = createActor(createAppBus(registry, early), { systemId: 'host/bus' }).start();
});

afterEach(() => {
  bus.stop();
  early.stop();
  registry.unregisterPack('log-pack');
});

it('delivers an early system the messages sent to its ref, which the bus leaves to it', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  testRootEvents.emitIncoming({ to: 'log-pack/journal', event: { type: 'CLEAR' } });
  testRootEvents.emitIncoming({ to: 'log-pack/notes', event: { type: 'CLEAR' } });

  expect(heard.filter(({ type }) => type === 'CLEAR')).toEqual([{ system: 'journal', type: 'CLEAR' }, { system: 'notes', type: 'CLEAR' }]);
  // The bus runs no early system, so routing the message itself would report it lost
  expect(warn).not.toHaveBeenCalled();
  warn.mockRestore();
});

it('tells an early system each client connection, as the bus tells the others', () => {
  testRootEvents.emitConnected();

  expect(heard.filter(({ type }) => type === 'CLIENT_CONNECTED').map(({ system }) => system).sort()).toEqual(['journal', 'notes']);
});

// An early system never reaches the bus machine, so the pair the bus sends every other system — the fact, then
// the ask — has to be sent to it here too. Without this, every early system silently stopped publishing.
it('asks an early system to publish, in the same order the bus asks the others', () => {
  testRootEvents.emitConnected();

  expect(heard.filter(({ system }) => system === 'journal').map(({ type }) => type))
    .toEqual(['CLIENT_CONNECTED', 'SEND_STATE']);
});

// The logs system answers each connection with its plugin's startup data. Told before the bus took the connection,
// the answer reached a bus still dropping sends to plugins, and the first window showed no boot logs.
it("delivers what an early system sends in answer to the first client connection", () => {
  const answering = setup({}).createMachine({ on: { CLIENT_CONNECTED: { actions: () => untypedBroadcastToPlugin('boot-pack/boot', { type: 'BOOT_LOGS' }) } } });
  bus.stop();
  early.stop();
  registry.registerPack({ id: 'boot-pack', features: { boot: { system: { machine: answering, receives: [], early: true }, plugin: { receives: ['BOOT_LOGS'] } } } });
  try {
    early = startEarlySystems(registry);
    bus = createActor(createAppBus(registry, early), { systemId: 'host/bus' }).start();
    const outgoing: Array<{ to: string; event: { type: string } }> = [];
    const stop = testRootEvents.onOutgoing((message) => { outgoing.push(message as never); });

    testRootEvents.emitConnected();

    stop();
    expect(outgoing).toContainEqual({ to: 'boot-pack/boot', event: { type: 'BOOT_LOGS' } });
  } finally {
    registry.unregisterPack('boot-pack');
  }
});

/**
 * An early system answers its sender like any other system, which takes the delivery scope being set on **this**
 * path too. The host delivers these messages itself (`startEarlySystems`), so nothing the bus's own routing does
 * covers it — and a system that cannot answer is the kind of gap that shows up only when a handler tries.
 */
it('lets an early system answer whoever asked, on the connection they asked from', () => {
  const answering = setup({
    actions: defineHandlers<MachineContext, AnyEventObject>().actions({
      answer: ({ reply }) => { reply?.({ type: 'BOOT_LOGS' }); },
    }),
  }).createMachine({
    on: { CLEAR: { actions: 'answer' } },
  });
  bus.stop();
  early.stop();
  registry.registerPack({
    id: 'ask-pack',
    features: { boot: { system: { machine: answering, receives: ['CLEAR'], early: true }, plugin: { receives: ['BOOT_LOGS'] } } },
  });
  try {
    early = startEarlySystems(registry);
    bus = createActor(createAppBus(registry, early), { systemId: 'host/bus' }).start();
    testRootEvents.emitConnected();
    const outgoing: Message[] = [];
    const stop = testRootEvents.onOutgoing((message) => { outgoing.push(message); });

    testRootEvents.emitIncoming({ to: 'ask-pack/boot', event: { type: 'CLEAR' }, sender: 'ask-pack/boot', client: 'c-main' });

    stop();
    expect(outgoing).toContainEqual({ to: 'ask-pack/boot', event: { type: 'BOOT_LOGS' }, sender: 'ask-pack/boot', client: 'c-main' });
  } finally {
    registry.unregisterPack('ask-pack');
  }
});
