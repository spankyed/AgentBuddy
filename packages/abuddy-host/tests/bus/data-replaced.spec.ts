// Replacing every row the app holds, and what the running systems are told about it.
//
// A system's state is what it last published, so wiping the rows underneath it leaves every plugin rendering a
// database that no longer exists. The bus answers `DATA_REPLACED` by asking each system for its startup data —
// the same ask a connecting client makes — so a system that declares no handler is correct anyway, which is
// what keeps this from being a thing all thirteen of them have to remember.
import { afterEach, expect, it } from 'vitest';
import { assign, createActor, setup, type AnyActorRef } from 'xstate';
import { untypedSendToSystem } from '@abuddy/sdk/events';
import { startTestRuntime } from '@abuddy/sdk/testing';
import { createAppBus } from '../../src/bus/index.ts';
import { HOST } from '../../src/refs.ts';
import { HOST_ENTITY_TYPES } from '../../src/app-state/index.ts';
import { createPackRegistry } from '../../src/packs/registry.ts';

const registry = createPackRegistry();
startTestRuntime({ entityTypes: HOST_ENTITY_TYPES, packs: registry });

/** Records what it was sent, in order, which is the whole of what either machine does */
const records = (...types: string[]) => setup({ types: { context: {} as { seen: string[] } } }).createMachine({
  context: { seen: [] },
  on: Object.fromEntries(types.map((type) => [
    type,
    { actions: assign({ seen: ({ context }: { context: { seen: string[] } }) => [...context.seen, type] }) },
  ])),
});

let bus: AnyActorRef | undefined;

afterEach(() => {
  bus?.stop();
  registry.unregisterPack('data-pack');
});

const seenBy = (feature: string): string[] =>
  (bus as AnyActorRef).system.get(`data-pack/${feature}`).getSnapshot().context.seen;

it('asks every running system for its startup data, and tells the ones that asked to be told first', async () => {
  registry.registerPack({
    id: 'data-pack',
    features: {
      // One system with something to tear down, and one with nothing: the second is the case that matters,
      // since it is every system that never thought about this
      watcher: { system: { machine: records('DATA_REPLACED', 'CLIENT_CONNECTED'), receives: [] } },
      quiet: { system: { machine: records('CLIENT_CONNECTED'), receives: [] } },
    },
  });
  bus = createActor(createAppBus(registry), { systemId: HOST.bus }).start();
  await new Promise((resolve) => setTimeout(resolve, 0));

  untypedSendToSystem(HOST.bus, { type: 'DATA_REPLACED' });
  await new Promise((resolve) => setTimeout(resolve, 0));

  // The order is load-bearing: a system drops work held over rows that are gone before it is asked to
  // describe itself, or it publishes a view of the world it is about to throw away
  expect(seenBy('watcher')).toEqual(['DATA_REPLACED', 'CLIENT_CONNECTED']);
  expect(seenBy('quiet'), 'a system that declares nothing is refreshed anyway').toEqual(['CLIENT_CONNECTED']);
});
