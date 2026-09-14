import { afterEach, describe, expect, it } from 'vitest';
import { getPackSettingsDefaults, type PackRegistration } from '@abuddy/sdk/framework';
import { seedHookRegistry } from '@abuddy/sdk/seed';
import { SDK_ENTITIES } from '@abuddy/sdk/types';
import { getPackContributions, getRegisteredEARS, getRegisteredEARSPolicy, getRegisteredEntityTypes, getRegisteredServices, registerPack, unregisterPack } from '../../src/packs/pack-registration.ts';

const registered: string[] = [];
afterEach(() => {
  for (const id of registered.splice(0)) unregisterPack(id);
});

function register(id: string, services: Record<string, unknown>): void {
  registerPack({ id, systems: [], services } as unknown as PackRegistration);
  registered.push(id);
}

describe('registerPack services', () => {
  it('rejects a service name another pack registered', () => {
    register('first-pack', { llm: {} });
    expect(() => register('second-pack', { llm: {} })).toThrow('Service collision: key "llm" — pack "second-pack" vs "first-pack"');
  });

  it.each(['logger', 'emitter', 'repository'])('rejects a pack service named like the host service %s', (name) => {
    expect(() => register('shadowing-pack', { [name]: {} })).toThrow(`vs the host's own "${name}" service`);
    expect(getRegisteredServices()).not.toHaveProperty(name);
  });

  it('registers distinct services', () => {
    register('first-pack', { llm: 1 });
    register('second-pack', { search: 2 });
    expect(getRegisteredServices()).toEqual({ llm: 1, search: 2 });
  });
});

describe('registerPack entities', () => {
  const registerEntities = (id: string, entities: Record<string, string>, relKinds: Record<string, string> = {}) => {
    registerPack({ id, systems: [], ears: { entities, relKinds } } as unknown as PackRegistration);
    registered.push(id);
  };

  it('rejects an entity type another pack registered', () => {
    registerEntities('first-pack', { Memo: 'Memo' });
    expect(() => registerEntities('second-pack', { Memo: 'Memo' })).toThrow('EARS collision: entity type "Memo" — pack "second-pack" vs "first-pack"');
  });

  it("rejects a relation kind another pack registered", () => {
    registerEntities('first-pack', {}, { PINNED: 'pinned' });
    expect(() => registerEntities('second-pack', {}, { PINNED: 'pinned' })).toThrow('EARS collision: relation kind "pinned" — pack "second-pack" vs "first-pack"');
  });

  it("has the SDK's entities and relation kinds with no pack registered, and doesn't count them as collisions", () => {
    const sdkEntities = Object.values(SDK_ENTITIES);
    expect([...getRegisteredEntityTypes()].sort()).toEqual([...sdkEntities].sort());
    expect(getRegisteredEARS().relKinds).toMatchObject({ CONTAINS: 'contains', TRANSITIONS_TO: 'transitions_to' });
    // Packs built with an older SDK list them
    registerEntities('first-pack', { Relation: 'Relation', Flow: 'Flow', Memo: 'Memo' }, { CONTAINS: 'contains' });
    expect(() => registerEntities('second-pack', { Relation: 'Relation', Flow: 'Flow', Tag: 'Tag' }, { CONTAINS: 'contains' })).not.toThrow();
    expect([...getRegisteredEntityTypes()].sort()).toEqual([...sdkEntities, 'Memo', 'Tag'].sort());
    // The registration keeps only the pack's own names
    expect(getPackContributions('first-pack')?.relKinds).toEqual({});
  });

  it('keeps TNode out of persistence and routes Secret to the secrets store without any pack asking', () => {
    expect(getRegisteredEARSPolicy()).toEqual({ excludedEntityTypes: ['TNode'], secretEntityTypes: ['Secret'] });
  });
});

describe('registerPack feature settings', () => {
  const memos = { id: 'memos', hasSystem: false, services: [], settings: { plugins: { _meta: { visibility: { memos: false } }, memos: { sort: 'newest' } } } };

  it("registers a pack's feature settings as defaults and drops them when it unregisters", () => {
    registerPack({ id: 'memo-pack', systems: [], features: [memos] } as unknown as PackRegistration);
    expect(getPackSettingsDefaults().settings).toEqual({ plugins: { memos: { sort: 'newest' }, _meta: { visibility: { memos: false } } } });
    unregisterPack('memo-pack');
    expect(getPackSettingsDefaults().settings).toEqual({ plugins: {} });
  });

  it("rejects a pack whose feature settings change another plugin's, registering none of it", () => {
    const hooks = { ears: { entities: { Memo: 'Memo' }, relKinds: {} }, seedHooks: { Memo: {} } };
    const invalid = { ...memos, settings: { plugins: { threads: { hidden: true } } } };
    expect(() => registerPack({ id: 'bad-pack', systems: [], ...hooks, features: [invalid] } as unknown as PackRegistration))
      .toThrow('Feature "memos" settings set "plugins.threads"');
    expect(getPackContributions('bad-pack')).toBeNull();
    expect(seedHookRegistry.get('Memo')).toBeUndefined();
    expect(getPackSettingsDefaults().settings).toEqual({ plugins: {} });
  });
});
