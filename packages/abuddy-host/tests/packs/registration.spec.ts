import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEarsEngine, installEngine, installedEngine, repository } from '@abuddy/ears';
import { getPackCommands, getPackSettingsDefaults, type PackRegistration, type PackSystemDef } from '@abuddy/sdk/framework';
import { artifactRegistry } from '@abuddy/sdk/artifacts';
import { seedHookRegistry } from '@abuddy/sdk/seed';
import { SDK_ENTITIES } from '@abuddy/sdk/types';
import { HOST_ENTITY_TYPES } from '../../src/app-state/index.ts';
import { getDesignated, hasDesignation } from '@abuddy/sdk/designations';
import { startTestRuntime } from '@abuddy/sdk/testing';
import { createPackRegistry } from '../../src/packs/pack-registration.ts';

const registry = createPackRegistry();
startTestRuntime({ packs: registry });
const {
  getPackContributions, getRegisteredEARS, getRegisteredEARSPolicy, getRegisteredEntityTypes, getRegisteredServices,
  registerPack, resolveSystemAddress, runRegisteredBootSeeds, unregisterPack,
} = registry;

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

describe('registerPack repositories', () => {
  const testEngine = installedEngine();
  afterEach(() => { installEngine(testEngine); });

  it("registers a pack's repositories with the installed engine (the app's), where repository and services read them", () => {
    const engine = createEarsEngine({ isEntityType: () => false });
    installEngine(engine.query);
    const noteQueries = { all: () => [] };
    registerPack({ id: 'repo-pack', systems: [], repositories: { noteQueries } });
    registered.push('repo-pack');
    expect(engine.query.repository.noteQueries).toBe(noteQueries);
    expect(repository.noteQueries).toBe(noteQueries);
    expect(engine.admin.repositories()).toEqual({ noteQueries });
  });
});

describe('registerPack designations', () => {
  const system = (id: string, designation?: string) => ({ id, machine: {} as unknown as PackSystemDef['machine'], events: new Set<string>(), designation });
  const journal = { id: 'journal', designation: 'journal', hasSystem: true, hasPlugin: false, services: [] };
  const registerDesignated = (id: string, systems: PackSystemDef[], extra: Partial<PackRegistration> = {}) => {
    registerPack({ id, systems, features: [journal], ...extra } as PackRegistration);
    registered.push(id);
  };

  it.each([
    ["an external pack's system", [system('ext.journal', 'journal')], 'ext.journal'],
    ["a built-in pack's system", [system('journal', 'journal')], 'journal'],
    ['the system the feature names, when it carries no designation', [system('ext.journal')], 'ext.journal'],
    ['the feature id, when no registered system plays it (the early system)', [], 'journal'],
  ])('resolves a role to %s', (_case, systems, expected) => {
    registerDesignated('ext', systems);
    expect(getDesignated('journal')).toBe(expected);
  });

  it('rejects a role another pack holds, registering none of the pack', () => {
    registerDesignated('first', [system('first.journal', 'journal')]);
    expect(() => registerDesignated('second', [system('second.journal', 'journal')], { services: { second: {} } }))
      .toThrow('Designation collision: role "journal" — pack "second" vs "first"');
    expect(getDesignated('journal')).toBe('first.journal');
    expect(getRegisteredServices()).not.toHaveProperty('second');
  });

  it("drops a pack's roles when it unregisters", () => {
    registerDesignated('ext', [system('ext.journal', 'journal')]);
    unregisterPack(registered.pop()!);
    expect(hasDesignation('journal')).toBe(false);
  });
});

describe('resolveSystemAddress', () => {
  const systemDef = (id: string) => ({ id, machine: {} as unknown as PackSystemDef['machine'], events: new Set<string>() });
  const registerSystems = (id: string, systemIds: string[]) => {
    registerPack({ id, systems: systemIds.map(systemDef) } as unknown as PackRegistration);
    registered.push(id);
  };

  it("resolves <packId>/<featureId> to the id the pack's system runs under", () => {
    registerSystems('default-setup', ['notes']);
    registerSystems('ext', ['ext.notes']);
    expect(resolveSystemAddress('default-setup/notes')).toBe('notes');
    expect(resolveSystemAddress('ext/notes')).toBe('ext.notes');
  });

  it('resolves nothing for an unregistered pack or feature, or a name without a pack', () => {
    registerSystems('ext', ['ext.notes']);
    for (const address of ['ext/tasks', 'other/notes', 'notes', 'ext.notes', '/notes']) {
      expect(resolveSystemAddress(address)).toBeUndefined();
    }
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

  it("has the SDK's and the host's entities and relation kinds with no pack registered, and doesn't count the SDK's as collisions", () => {
    const sdkEntities = [...Object.values(SDK_ENTITIES), ...HOST_ENTITY_TYPES];
    expect([...getRegisteredEntityTypes()].sort()).toEqual([...sdkEntities].sort());
    expect(getRegisteredEARS().relKinds).toMatchObject({ CONTAINS: 'contains', TRANSITIONS_TO: 'transitions_to' });
    // Packs built with an older SDK list them
    registerEntities('first-pack', { Relation: 'Relation', Flow: 'Flow', Memo: 'Memo' }, { CONTAINS: 'contains' });
    expect(() => registerEntities('second-pack', { Relation: 'Relation', Flow: 'Flow', Tag: 'Tag' }, { CONTAINS: 'contains' })).not.toThrow();
    expect([...getRegisteredEntityTypes()].sort()).toEqual([...sdkEntities, 'Memo', 'Tag'].sort());
    // The registration keeps only the pack's own names
    expect(getPackContributions('first-pack')?.relKinds).toEqual({});
  });

  it("rejects an entity type the host declares", () => {
    expect(() => registerEntities('first-pack', { AppState: 'AppState' })).toThrow('EARS collision: entity type "AppState" — pack "first-pack" vs the host\'s own "AppState"');
  });

  it('keeps TNode out of persistence and routes Secret to the secrets store without any pack asking', () => {
    expect(getRegisteredEARSPolicy()).toEqual({ excludedEntityTypes: ['TNode'] });
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

describe('registerPack seed hooks', () => {
  const memoHooks = { find: () => undefined };

  it('rejects hooks for an entity another pack owns, rolling back what the pack registered', () => {
    registerPack({ id: 'memo-pack', systems: [], ears: { entities: { Memo: 'Memo' }, relKinds: {} }, seedHooks: { Memo: memoHooks } } as unknown as PackRegistration);
    registered.push('memo-pack');

    const other = {
      id: 'other-pack',
      systems: [],
      ears: { entities: { Card: 'Card' }, relKinds: {} },
      artifacts: [{ type: 'card-view' }],
      commands: [{ name: 'card', placeholder: 'Title' }],
      seedHooks: { Card: {}, Memo: {} },
    };
    expect(() => registerPack(other as unknown as PackRegistration))
      .toThrow('Seed hooks for "Memo" are already registered by pack "memo-pack"');

    expect(getPackContributions('other-pack')).toBeNull();
    expect(seedHookRegistry.get('Memo')).toBe(memoHooks);
    expect(seedHookRegistry.get('Card')).toBeUndefined();
    expect(artifactRegistry.has('card-view')).toBe(false);
    expect(getPackCommands()).toEqual([]);
  });

  it("drops a pack's hooks when it unregisters, freeing the entity for another pack", () => {
    registerPack({ id: 'memo-pack', systems: [], ears: { entities: { Memo: 'Memo' }, relKinds: {} }, seedHooks: { Memo: memoHooks } } as unknown as PackRegistration);
    unregisterPack('memo-pack');
    expect(seedHookRegistry.get('Memo')).toBeUndefined();

    const theirs = {};
    registerPack({ id: 'other-pack', systems: [], seedHooks: { Memo: theirs } } as unknown as PackRegistration);
    registered.push('other-pack');
    expect(seedHookRegistry.get('Memo')).toBe(theirs);
  });
});

describe('registerPack commands', () => {
  const commands = [{ name: 'standup', placeholder: 'Topic' }];

  it("registers a pack's declared commands and drops them when it unregisters", () => {
    registerPack({ id: 'memo-pack', systems: [], commands } as unknown as PackRegistration);
    expect(getPackCommands()).toEqual(commands);
    unregisterPack('memo-pack');
    expect(getPackCommands()).toEqual([]);
  });

  it('rejects a command another pack declares, registering none of the pack', () => {
    registerPack({ id: 'memo-pack', systems: [], commands } as unknown as PackRegistration);
    registered.push('memo-pack');

    expect(() => registerPack({ id: 'other-pack', systems: [], steps: [], commands: [{ name: 'standup', placeholder: 'Theirs' }] } as unknown as PackRegistration))
      .toThrow('Command collision: "standup" — pack "other-pack" vs "memo-pack"');

    expect(getPackContributions('other-pack')).toBeNull();
    expect(getPackCommands()).toEqual(commands);
  });

  it("rolls its commands back when a later part of the registration is refused", () => {
    const invalid = { id: 'memos', hasSystem: false, services: [], settings: { plugins: { threads: { hidden: true } } } };

    expect(() => registerPack({ id: 'bad-pack', systems: [], commands, features: [invalid] } as unknown as PackRegistration)).toThrow();

    expect(getPackCommands()).toEqual([]);
    expect(getPackSettingsDefaults().settings).toEqual({ plugins: {} });
  });
});

describe('runRegisteredBootSeeds', () => {
  it("seeds a pack's declarative seedManifest and ignores any other boot key", () => {
    const seedManifest = { artifacts: ['actions'], compiledDir: '/compiled' };
    const smuggled = vi.fn();
    registerPack({ id: 'built-in-pack', systems: [], boot: { seedManifest } } as unknown as PackRegistration);
    registerPack({ id: 'hooks-pack', systems: [], boot: { onInit() {}, seed: smuggled } } as unknown as PackRegistration);
    registered.push('built-in-pack', 'hooks-pack');

    const orchestrate = vi.fn();
    runRegisteredBootSeeds(orchestrate);

    expect(orchestrate).toHaveBeenCalledTimes(1);
    // With the pack it belongs to, so each pack's boot seed is tracked under its own id
    expect(orchestrate).toHaveBeenCalledWith(seedManifest, 'built-in-pack');
    expect(smuggled).not.toHaveBeenCalled();
    expect(getPackContributions('built-in-pack')?.bootHooks).toEqual(['seedManifest']);
    expect(getPackContributions('hooks-pack')?.bootHooks).toEqual(['onInit']);
  });
});
