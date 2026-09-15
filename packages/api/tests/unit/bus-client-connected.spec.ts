// Systems send their startup data on CLIENT_CONNECTED. The bus sends it on every client connection, except
// to external packs with plugins: a client loads their frontends after connecting and asks for each once
// its plugin actors exist (as it does for a pack being activated). A reloaded pack's restarted systems get
// it too.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor, setup, type AnyActorRef } from 'xstate';

vi.mock('@abuddy/host/settings', () => ({
  settingsRepository: { settingsQueries: { getInternalSettings: () => ({ hasOnboarded: true }) } },
}));

const { registerPack, unregisterPack } = await import('@abuddy/host/packs');
const { backendSystem } = await import('@/systems');
const { createBusMachine } = await import('@abuddy/host/bus');
const { rootEvents } = await import('@/core/router/bus-emitter');
const { updateLoadedPack, removeLoadedPack } = await import('@/packs/pack-api');
type LoadedPack = import('@/packs/pack-loader').LoadedPack;

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
  for (const id of ['first-pack', 'second-pack', 'external-pack']) {
    try { unregisterPack(id); } catch { /* not registered */ }
    removeLoadedPack(id);
  }
});

describe('CLIENT_CONNECTED on the bus', () => {
  it('reaches every system when a client connects', async () => {
    rootEvents.emitConnected();
    await flush();
    expect(received).toEqual(['first-pack']);
  });

  it('reaches an external pack with plugins once, when a client has loaded its frontend after connecting', async () => {
    bus.stop();
    registerPack(pack('external-pack'));
    updateLoadedPack({
      manifest: { id: 'external-pack', name: 'External', version: '1.0.0', features: [{ id: 'feature', plugin: { entry: 'fe.js', label: 'Feature', icon: 'Zap' } }] },
      dir: '/packs/external-pack',
      systems: new Map(),
    } as unknown as LoadedPack);
    bus = createActor(backendSystem, { systemId: 'bus' }).start();

    rootEvents.emitConnected();
    await flush();
    expect(received).toEqual(['first-pack']);

    rootEvents.emitPackClientConnected('external-pack');
    await flush();
    expect(received).toEqual(['first-pack', 'external-pack']);
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

  it("reaches an activated pack's systems once, when a client has loaded its frontend", async () => {
    rootEvents.emitConnected();
    await flush();
    received.length = 0;
    registerPack(pack('second-pack'));
    bus.send({ type: 'ACTIVATE_PACK', systemIds: ['second-pack.feature'] });
    await flush();
    expect(received).toEqual([]);

    rootEvents.emitPackClientConnected('second-pack');
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

  it("reaches only the running systems of a reloaded pack that dropped a feature", async () => {
    unregisterPack('first-pack');
    registerPack({
      id: 'first-pack',
      systems: [
        { id: 'first-pack.feature', machine: recorder('feature'), events: new Set(['CLIENT_CONNECTED']) },
        { id: 'first-pack.dropped', machine: recorder('dropped'), events: new Set(['CLIENT_CONNECTED']) },
      ],
    });
    bus.stop();
    bus = createActor(backendSystem, { systemId: 'bus' }).start();
    rootEvents.emitConnected();
    await flush();
    received.length = 0;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    unregisterPack('first-pack');
    registerPack(pack('first-pack', 'feature (reloaded)'));
    bus.send({ type: 'RELOAD_PACK', packId: 'first-pack', systemIds: ['first-pack.feature', 'first-pack.dropped'] });
    await flush();

    expect(received).toEqual(['feature (reloaded)']);
    expect(bus.system.get('first-pack.dropped')).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('a bus given a subset of the registered systems', () => {
  let subsetBus: AnyActorRef;
  let connect: () => void;
  let packConnect: (packId: string) => void;

  beforeEach(() => {
    registerPack({
      id: 'second-pack',
      systems: [
        { id: 'second-pack.feature', machine: recorder('second-pack'), events: new Set(['CLIENT_CONNECTED']) },
        { id: 'second-pack.outside', machine: recorder('outside'), events: new Set(['CLIENT_CONNECTED']) },
      ],
    });
    const subset = new Map([['second-pack.feature', recorder('second-pack')]]);
    bus.stop();
    subsetBus = createActor(createBusMachine({
      systems: () => subset,
      onOutgoing: () => {},
      listen: (send) => {
        connect = () => send({ type: 'CLIENT_CONNECTED' });
        packConnect = (packId) => send({ type: 'PACK_CLIENT_CONNECTED', packId });
        return () => {};
      },
    }), { systemId: 'bus' }).start();
    connect();
    received.length = 0;
  });

  afterEach(() => subsetBus.stop());

  it("sends a pack's CLIENT_CONNECTED only to the pack's systems it runs", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    packConnect('second-pack');
    await flush();
    expect(received).toEqual(['second-pack']);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('activates and reloads only the systems it runs', async () => {
    subsetBus.send({ type: 'RELOAD_PACK', packId: 'second-pack', systemIds: ['second-pack.feature', 'second-pack.outside'] });
    await flush();
    expect(received).toEqual(['second-pack']);
    expect(subsetBus.system.get('second-pack.outside')).toBeUndefined();

    subsetBus.send({ type: 'TEARDOWN_PACK', systemIds: ['second-pack.feature'] });
    subsetBus.send({ type: 'ACTIVATE_PACK', systemIds: ['second-pack.feature', 'second-pack.outside'] });
    await flush();
    expect(subsetBus.system.get('second-pack.feature')).toBeDefined();
    expect(subsetBus.system.get('second-pack.outside')).toBeUndefined();
  });
});
