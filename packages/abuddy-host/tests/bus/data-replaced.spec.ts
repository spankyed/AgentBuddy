// What the running systems are told when every row the app holds is replaced.
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createActor, setup, type AnyActorRef } from 'xstate';
import { untypedSendToSystem } from '@abuddy/sdk/events';
import { startTestRuntime } from '@abuddy/sdk/testing';
import { createAppBus } from '../../src/bus/index.ts';
import { HOST } from '../../src/refs.ts';
import { HOST_ENTITY_TYPES } from '../../src/app-state/index.ts';
import { createPackRegistry } from '../../src/packs/registry.ts';

const registry = createPackRegistry();
startTestRuntime({ entityTypes: HOST_ENTITY_TYPES, packs: registry });

const seen: Record<string, string[]> = {};

/** A system whose whole behaviour is recording the events it declares, in the order they arrive */
const records = (feature: string, ...types: string[]) => setup({}).createMachine({
  on: Object.fromEntries(types.map((type) => [type, { actions: () => seen[feature].push(type) }])),
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

let bus: AnyActorRef | undefined;

beforeEach(() => { seen.watcher = []; seen.quiet = []; });
afterEach(() => {
  bus?.stop();
  registry.unregisterPack('data-pack');
});

it('tells every running system, then asks each for its startup data', async () => {
  registry.registerPack({
    id: 'data-pack',
    features: {
      watcher: { system: { machine: records('watcher', 'DATA_REPLACED', 'CLIENT_CONNECTED'), receives: [] } },
      quiet: { system: { machine: records('quiet', 'CLIENT_CONNECTED'), receives: [] } },
    },
  });
  bus = createActor(createAppBus(registry), { systemId: HOST.bus }).start();
  await settle();

  untypedSendToSystem(HOST.bus, { type: 'DATA_REPLACED' });
  await settle();

  // Told before being asked, so work held over rows that are gone is dropped before the system describes itself
  expect(seen.watcher).toEqual(['DATA_REPLACED', 'CLIENT_CONNECTED']);
  expect(seen.quiet, 'a system that declares nothing is refreshed anyway').toEqual(['CLIENT_CONNECTED']);
});
