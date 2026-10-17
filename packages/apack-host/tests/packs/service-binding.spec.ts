import { afterEach, describe, expect, it, vi } from 'vitest';
import { _createPackServices, type InferenceService } from '@apackdev/sdk/services';
import { startTestRuntime, fakeInference, testRootEvents } from '@apackdev/sdk/testing';
import { bindHost } from '@apackdev/sdk/runtime';
import { boundHost, unbindHost } from '@apackdev/sdk/runtime/internals';
import type { NativePackDeclaration, PackRegistration } from '@apackdev/sdk/framework';
import { _declarationRevision, PACK_SNAPSHOT_FORMAT, type PackManifest } from '@apackdev/sdk/build';
import type { PackCatalogEntry } from '../../src/packs/catalog.ts';
import { createPackRegistry } from '../../src/packs/registry.ts';

const settings = { get: <T>() => ({} as T), set() {}, reset() {}, onChange: () => () => {} };
const mocks = new Map<string, unknown>();
const packs = createPackRegistry({ settingsForPack: () => settings, serviceOverrides: mocks });
startTestRuntime({ packs: { ...packs, getRegisteredServices: () => ({ ...packs.getRegisteredServices(), ...Object.fromEntries(mocks) }) } });
const host = boundHost();
const declared = new Map<string, NativePackDeclaration>();
function register(declaration: NativePackDeclaration, registration: PackRegistration) {
  declared.set(declaration.id, declaration);
  packs.catalog.setNative([...declared.values()]);
  packs.registerPack(registration);
}
function caller(id = 'consumer', services = ['provider/search']) {
  const generated = _createPackServices();
  register({ id, dependencies: { provider: '*' }, consumes: { services } }, { id, dependencies: { provider: '*' }, bindServices: generated.bindServices });
  return generated;
}
afterEach(() => {
  for (const id of declared.keys()) if (packs.getPackRegistration(id)) packs.unregisterPack(id);
  vi.restoreAllMocks();
  declared.clear(); packs.catalog.setNative([]); mocks.clear();
  if (boundHost() !== host) { unbindHost(); bindHost(host); }
});
class Search {
  #text = 'original';
  read() { return this.#text; }
  nested = Object.freeze({ read: () => this.#text });
}
const provider = { id: 'provider', services: { search: 'unavailable.ts#search' } };

describe('accepted service bindings', () => {
  it('filters untyped access and preserves private receivers and frozen nested services', () => {
    register(provider, { id: 'provider', services: { search: Object.freeze(new Search()) } });
    const generated = caller('consumer', ['provider/search', 'host/onboarding']);
    expect(Object.keys(generated.services).sort()).toEqual(['emitter', 'logger', 'onboarding', 'repository', 'search', 'settings']);
    expect(generated.services.appData).toBeUndefined();
    expect('inference' in generated.services).toBe(false);
    const search = generated.services.search as Search;
    const { read } = search;
    const nestedRead = search.nested.read;
    expect(read === search.read).toBe(true);
    expect(read()).toBe('original'); expect(nestedRead()).toBe('original');
    packs.unregisterPack('consumer');
    expect(() => read()).toThrow('revoked');
    expect(() => nestedRead()).toThrow('revoked');
  });

  it('retires provider handles even when the same registration and service object are reused', () => {
    const registration = { id: 'provider', services: { search: new Search() } };
    register(provider, registration);
    const generated = caller();
    const retained = generated.services.search as Search;
    const read = retained.read;
    packs.replacePack(registration);
    expect(() => read()).toThrow('retired provider');
    expect(() => retained.nested.read()).toThrow('retired provider');
    expect((generated.services.search as Search).read()).toBe('original');
    packs.unregisterPack('provider');
    expect(() => generated.services.search).toThrow('provider "provider" is not ready');
  });

  it('keeps another registrys same-named service and overrides out of this selection', () => {
    register(provider, { id: 'provider', services: { search: { read: () => 'original' } } });
    mocks.set('search', { read: () => 'mocked' });
    const first = caller();
    const second = _createPackServices();
    const isolated = createPackRegistry({ settingsForPack: () => settings, nativeDeclarations: [provider,
      { id: 'other', dependencies: { provider: '*' }, consumes: { services: ['provider/search'] } }],
    });
    isolated.registerPack({ id: 'provider', services: { search: { read: () => 'isolated' } } });
    isolated.registerPack({ id: 'other', dependencies: { provider: '*' }, bindServices: second.bindServices });
    try {
      expect((first.services.search as Search).read()).toBe('mocked');
      expect((second.services.search as Search).read()).toBe('isolated');
    } finally { isolated.unregisterPack('other'); isolated.unregisterPack('provider'); }
  });

  it('keeps disabled actors bound until retirement while refusing other callers access to the provider', () => {
    const manifest: PackManifest = { id: 'provider', name: 'Provider', version: '1.0.0',
      extensions: { services: { search: 'unavailable.ts#search' } } };
    const declarationRevision = _declarationRevision(manifest);
    const entry: PackCatalogEntry = { dir: '/unavailable/provider', enabled: true, snapshot: {
      format: PACK_SNAPSHOT_FORMAT, declarationRevision, manifest,
      types: { entities: {}, relKinds: {} }, entityDestinations: {}, facades: {},
    } };
    packs.catalog.replace([entry]);
    const own = _createPackServices();
    packs.registerPack({ id: 'provider', declarationRevision, services: { search: new Search() }, bindServices: own.bindServices },
      { id: 'provider', name: manifest.name, version: manifest.version, dir: entry.dir, manifest, declarationRevision });
    try {
      const peer = caller();
      const ownServices = own.services;
      const ownRead = (ownServices.search as Search).read;
      const peerRead = (peer.services.search as Search).read;
      packs.catalog.replace([{ ...entry, enabled: false }]);
      expect(ownRead()).toBe('original');
      expect((own.services.search as Search).read()).toBe('original');
      expect(() => peerRead()).toThrow('retired provider');
      expect(() => peer.services.search).toThrow('not ready');
      packs.unregisterPack('provider');
      expect(() => ownRead()).toThrow('revoked');
      expect(() => ownServices.search).toThrow('revoked');
    } finally {
      if (packs.getPackRegistration('provider')) packs.unregisterPack('provider');
      packs.catalog.replace([]);
    }
  });

  it('keeps a draining callers own service on its original generation until coordinated retirement', () => {
    const first = _createPackServices();
    const next = _createPackServices();
    register({ id: 'consumer', services: { own: 'unavailable.ts#own' } },
      { id: 'consumer', services: { own: { read: () => 'old' } }, bindServices: first.bindServices });
    let retire!: () => string[];
    packs.replacePack({ id: 'consumer', services: { own: { read: () => 'new' } }, bindServices: next.bindServices },
      undefined, { retireBinding: dispose => { retire = dispose; } });
    const old = first.services.own as { read(): string };
    expect(old.read()).toBe('old');
    expect((next.services.own as { read(): string }).read()).toBe('new');
    retire();
    expect(() => old.read()).toThrow('revoked');
  });

  it('keeps host replacement separate from reused host implementations', () => {
    const generated = caller('consumer', ['host/onboarding']);
    const onboarding = generated.services.onboarding as { isComplete(): boolean };
    const read = onboarding.isComplete;
    unbindHost(); bindHost({ ...host });
    expect(() => read()).toThrow('retired runtime or host');
    expect(() => generated.services.onboarding).toThrow('retired runtime or host');
    unbindHost(); bindHost(host);
    expect(() => read()).toThrow('retired runtime or host');
  });

  it('uses test mocks only within the declared selection and allows started calls to settle', async () => {
    let finish!: (value: string) => void;
    const pending = new Promise<string>(resolve => { finish = resolve; });
    register(provider, { id: 'provider', services: { search: new Search() } });
    mocks.set('search', { read: () => pending });
    mocks.set('appData', { reset: () => { throw new Error('Must remain hidden'); } });
    const generated = caller();
    const result = (generated.services.search as { read(): Promise<string> }).read();
    packs.unregisterPack('provider');
    finish('completed original call');
    await expect(result).resolves.toBe('completed original call');
    expect(generated.services.appData).toBeUndefined();
  });

  it('allows an accepted stream and result to finish after retirement without starting new calls', async () => {
    const result = { text: 'original result' };
    const stream = { textStream: (async function* () { yield 'original stream'; })() };
    mocks.set('inference', { generateText: async () => result, streamText: async () => stream });
    const generated = caller('consumer', ['host/inference']);
    const inference = generated.services.inference as { generateText(): Promise<typeof result>; streamText(): Promise<typeof stream> };
    const pending = inference.generateText();
    const running = await inference.streamText();
    packs.unregisterPack('consumer');
    expect(await pending === result).toBe(true);
    const text = [];
    for await (const part of running.textStream) text.push(part);
    expect(text).toEqual(['original stream']);
    expect(() => inference.generateText()).toThrow('revoked');
  });

  it('preserves a real AI SDK agent receiver and refuses its retained methods after retirement', async () => {
    mocks.set('inference', fakeInference('original response'));
    const generated = caller('consumer', ['host/inference']);
    const inference = generated.services.inference as InferenceService;
    const agent = await inference.createAgent({ model: 'openai:gpt-5' });
    const generate = agent.generate;
    expect((await generate({ prompt: 'Hello' })).text).toBe('original response');
    packs.unregisterPack('consumer');
    expect(() => generate({ prompt: 'Again' })).toThrow('revoked');
  });

  it('keeps named action logging and sends inside the accepted selection and lifetime', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    register({ id: 'receiver', features: { destination: { description: 'Attribute sends to the declared role.', designation: 'brain' } } },
      { id: 'receiver', features: { destination: { designation: 'brain' } } });
    const generated = caller('consumer', ['host/onboarding']);
    const factory = generated.servicesForAction;
    const action = factory('Example');
    expect(Object.keys(action)).toEqual(Object.keys(generated.services));
    expect(action.appData).toBeUndefined();
    const log = (action.logger as { info(message: string): void }).info;
    const send = (action.emitter as { sendToSystem(to: { role: string }, event: { type: string }): void }).sendToSystem;
    const messages: unknown[] = [];
    const logs: unknown[] = [];
    const stops = [testRootEvents.onIncoming(message => messages.push(message)), testRootEvents.onLog(event => logs.push(event))];
    try {
      log('Hello'); send({ role: 'brain' }, { type: 'RUN' });
      expect(logs).toContainEqual(expect.objectContaining({ source: 'action:Example', message: 'Hello' }));
      expect(messages).toContainEqual(expect.objectContaining({ from: 'consumer', via: 'action:Example', event: { type: 'RUN' } }));
      packs.unregisterPack('consumer');
      expect(() => log('Late')).toThrow('revoked');
      expect(() => send({ role: 'brain' }, { type: 'LATE' })).toThrow('revoked');
      const replacement = caller('consumer', ['host/onboarding']);
      expect(() => factory('Late')).toThrow('revoked');
      expect(replacement.servicesForAction('Fresh').appData).toBeUndefined();
      expect(messages).toHaveLength(1);
    } finally { stops.forEach(stop => stop()); }
  });

  it('guards inference agents returned after caller retirement', async () => {
    let finish!: (agent: object) => void;
    let calls = 0;
    const agent = Object.freeze({ generate() { calls++; return Promise.resolve({ text: 'complete' }); } });
    mocks.set('inference', { createAgent: () => new Promise<object>(resolve => { finish = resolve; }) });
    const generated = caller('consumer', ['host/inference']);
    const pending = (generated.services.inference as { createAgent(): Promise<typeof agent> }).createAgent();
    packs.unregisterPack('consumer');
    finish(agent);
    const retained = await pending;
    expect(() => retained.generate()).toThrow('revoked');
    expect(calls).toBe(0);
  });
});
