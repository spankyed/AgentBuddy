// What the running systems are told when every row the app holds is replaced.
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

/** A system whose whole behaviour is recording the events it declares, in order */
const records = (...types: string[]) => setup({ types: { context: {} as { seen: string[] } } }).createMachine({
  context: { seen: [] },
  on: Object.fromEntries(types.map((type) => [type, {
    actions: assign({ seen: ({ context }: { context: { seen: string[] } }) => [...context.seen, type] }),
  }])),
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const seenBy = (feature: string): string[] =>
  (bus as AnyActorRef).system.get(`data-pack/${feature}`).getSnapshot().context.seen;

let bus: AnyActorRef | undefined;

afterEach(() => {
  bus?.stop();
  registry.unregisterPack('data-pack');
});

it('tells every running system, then asks each for its startup data', async () => {
  registry.registerPack({
    id: 'data-pack',
    features: {
      watcher: { system: { machine: records('DATA_REPLACED', 'CLIENT_CONNECTED'), receives: [] } },
      quiet: { system: { machine: records('CLIENT_CONNECTED'), receives: [] } },
    },
  });
  bus = createActor(createAppBus(registry), { systemId: HOST.bus }).start();
  await settle();

  untypedSendToSystem(HOST.bus, { type: 'DATA_REPLACED' });
  await settle();

  // Told before being asked, so work held over rows that are gone is dropped before the system describes itself
  expect(seenBy('watcher')).toEqual(['DATA_REPLACED', 'CLIENT_CONNECTED']);
  expect(seenBy('quiet'), 'a system that declares nothing is refreshed anyway').toEqual(['CLIENT_CONNECTED']);
});
