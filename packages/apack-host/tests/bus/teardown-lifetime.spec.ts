import { afterEach, expect, it } from 'vitest';
import { createActor, fromCallback, setup, type AnyActorRef } from 'xstate';
import { createNativePackTestRegistry } from '@apackdev/host/testing';
import { startTestRuntime } from '@apackdev/sdk/testing';
import { createAppBus } from '../../src/bus/app.ts';
import { HOST_ENTITY_TYPES } from '../../src/app-state/index.ts';

let bus: AnyActorRef | undefined;
afterEach(() => bus?.stop());

it('finishes actor work and subscription cleanup before retiring runtime authority', () => {
  const registry = createNativePackTestRegistry();
  startTestRuntime({ entityTypes: HOST_ENTITY_TYPES, packs: registry });
  const order: string[] = [];
  let retired = false;
  const read = () => { if (retired) throw new Error('Runtime authority retired before actor cleanup'); };
  const worker = setup({ actors: { subscription: fromCallback(() => () => { read(); order.push('cleanup'); }) } }).createMachine({
    invoke: { src: 'subscription' },
    on: { STOP: { actions: () => {
      bus!.send({ type: 'TEARDOWN_PACK', systemIds: ['worker/observer'], afterStop: () => { retired = true; order.push('retired'); } });
      read();
      order.push('current-action');
    } } },
  });
  registry.registerPack({ id: 'worker', features: { observer: { system: { machine: worker, receives: ['STOP'] } } } });
  bus = createActor(createAppBus(registry), { systemId: 'host/bus' }).start();
  bus.system.get('worker/observer').send({ type: 'STOP' });
  expect(order).toEqual(['current-action', 'cleanup', 'retired']);
  expect(bus.system.get('worker/observer')).toBeUndefined();
});
