// Systems send their startup data on CLIENT_CONNECTED. The bus sends it on every client connection,
// to a pack's systems again when a client finishes loading that pack's frontend (its plugin actors
// exist only then), and to systems it spawns for an activated or reloaded pack.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor, setup, type AnyActorRef } from 'xstate';

vi.mock('@abuddy/host/settings', () => ({
  settingsRepository: { settingsQueries: { getInternalSettings: () => ({ hasOnboarded: true }) } },
}));

const { registerPack, unregisterPack } = await import('@abuddy/host/packs');
const { backendSystem } = await import('@/systems');
const { rootEvents } = await import('@/core/router/bus-emitter');

const received: string[] = [];

/** A system that records each CLIENT_CONNECTED it receives */
function recorder(label: string) {
  return setup({}).createMachine({
    on: { CLIENT_CONNECTED: { actions: () => received.push(label) } },
  });
}

function pack(id: string, label = id) {
  return { id, systems: [{ id: `${id}.feature`, machine: recorder(label), events: new Set(['CLIENT_CONNECTED']) }] };
}

let bus: AnyActorRef;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  received.length = 0;
  registerPack(pack('first-pack'));
  bus = createActor(backendSystem, { systemId: 'bus' }).start();
});

afterEach(() => {
  bus.stop();
  for (const id of ['first-pack', 'second-pack']) {
    try { unregisterPack(id); } catch { /* not registered */ }
  }
});

describe('CLIENT_CONNECTED on the bus', () => {
  it('reaches every system when a client connects', async () => {
    rootEvents.emitConnected();
    await flush();
    expect(received).toEqual(['first-pack']);
  });

  it("reaches only a pack's systems when a client has loaded that pack's frontend", async () => {
    rootEvents.emitConnected();
    registerPack(pack('second-pack'));
    bus.send({ type: 'ACTIVATE_PACK', systemIds: ['second-pack.feature'] });
    await flush();
    received.length = 0;

    rootEvents.emitPackClientConnected('second-pack');
    await flush();
    expect(received).toEqual(['second-pack']);

    rootEvents.emitPackClientConnected('first-pack');
    await flush();
    expect(received).toEqual(['second-pack', 'first-pack']);
  });

  it('reaches systems spawned for an activated pack', async () => {
    rootEvents.emitConnected();
    await flush();
    received.length = 0;
    registerPack(pack('second-pack'));
    bus.send({ type: 'ACTIVATE_PACK', systemIds: ['second-pack.feature'] });
    await flush();
    expect(received).toEqual(['second-pack']);
  });

  it('reaches the new actors of a reloaded pack, not the stopped ones', async () => {
    rootEvents.emitConnected();
    await flush();
    received.length = 0;
    unregisterPack('first-pack');
    registerPack(pack('first-pack', 'first-pack (reloaded)'));
    bus.send({ type: 'RELOAD_PACK', packId: 'first-pack', systemIds: ['first-pack.feature'] });
    await flush();
    expect(received).toEqual(['first-pack (reloaded)']);
  });
});
